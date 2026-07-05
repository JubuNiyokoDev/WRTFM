import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db, verificationsTable, assignmentsTable, activityEventsTable, walletsTable, transactionsTable, tasksTable, usersTable, campaignsTable } from "@/db";
import {
  ListVerificationsQueryParams,
  ListVerificationsResponse,
  GetVerificationParams,
  GetVerificationResponse,
  ReviewVerificationParams,
  ReviewVerificationBody,
  ReviewVerificationResponse,
} from "@/api-zod";
import { requireAuth, requireRole } from "@/middlewares/auth";
import {
  broadcastNotification,
  createVerificationCompletedNotification,
  createWalletCreditedNotification,
} from "@/lib/notifications";
import { logManualReview, logWalletTransaction } from "@/lib/audit-logger";

const router: IRouter = Router();

function formatVerification(v: any) {
  return {
    ...v,
    checks: v.checks as any[] ?? [],
    reviewNotes: v.reviewNotes ?? null,
    reviewedBy: v.reviewedBy ?? null,
    reviewedAt: v.reviewedAt ? v.reviewedAt.toISOString() : null,
  };
}

router.get("/verifications", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ListVerificationsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (status) conditions.push(eq(verificationsTable.status, status as any));

  const [verifications, countResult] = await Promise.all([
    db.select().from(verificationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(verificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(verificationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  res.json(ListVerificationsResponse.parse({
    items: verifications.map(formatVerification),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  }));
});

router.get("/verifications/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = GetVerificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [verification] = await db.select().from(verificationsTable)
    .where(eq(verificationsTable.id, params.data.id));

  if (!verification) {
    res.status(404).json({ error: "Verification not found" });
    return;
  }

  res.json(GetVerificationResponse.parse(formatVerification(verification)));
});

router.post("/verifications/:id/review", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const userId = (req as any).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = ReviewVerificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ReviewVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [currentVerification] = await db.select().from(verificationsTable)
    .where(eq(verificationsTable.id, params.data.id));
  if (!currentVerification) {
    res.status(404).json({ error: "Verification not found" });
    return;
  }
  if (currentVerification.status !== "manual_review") {
    res.status(409).json({ error: "This verification has already been decided" });
    return;
  }

  const { decision, notes } = parsed.data;

  const { verification, assignment } = await db.transaction(async (tx) => {
    if (decision === "request_correction") {
      const [verification] = await tx.update(verificationsTable).set({
        status: "manual_review",
        reviewNotes: notes ?? null,
        reviewedBy: userId,
        reviewedAt: new Date(),
        method: "hybrid",
      }).where(eq(verificationsTable.id, params.data.id)).returning();

      const [assignment] = await tx.update(assignmentsTable).set({
        status: "correction_requested",
      }).where(eq(assignmentsTable.id, verification.assignmentId)).returning();

      if (!assignment) {
        throw new Error("Assignment not found for verification");
      }

      const [task] = await tx.select().from(tasksTable).where(eq(tasksTable.id, assignment.taskId));
      if (task) {
        await tx.update(tasksTable).set({ status: "in_progress" }).where(eq(tasksTable.id, task.id));
      }

      await tx.insert(activityEventsTable).values({
        type: "task_resubmitted",
        description: `Manual review: correction requested - ${notes ?? "no details"}`,
        userId: assignment.workerId ?? null,
        taskId: assignment.taskId ?? null,
      });

      return { verification, assignment };
    }

    const newStatus = decision === "approved" ? "approved" : "rejected";

    const [verification] = await tx.update(verificationsTable).set({
      status: newStatus,
      reviewNotes: notes ?? null,
      reviewedBy: userId,
      reviewedAt: new Date(),
      method: "hybrid",
    }).where(eq(verificationsTable.id, params.data.id)).returning();

    const assignmentStatus = decision === "approved" ? "approved" : "rejected";
    const [assignment] = await tx.update(assignmentsTable).set({
      status: assignmentStatus,
      completedAt: new Date(),
    }).where(eq(assignmentsTable.id, verification.assignmentId)).returning();

    if (!assignment) {
      throw new Error("Assignment not found for verification");
    }

    const [task] = await tx.select().from(tasksTable).where(eq(tasksTable.id, assignment.taskId));
    if (!task) {
      throw new Error("Task not found for assignment");
    }
    const [campaign] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, task.campaignId));
    if (!campaign || campaign.status === "cancelled") {
      throw new Error("Campaign is no longer reviewable");
    }

    if (decision === "approved" && assignment.reward && assignment.workerId) {
      let [wallet] = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, assignment.workerId));
      if (!wallet) {
        [wallet] = await tx.insert(walletsTable).values({
          userId: assignment.workerId,
          balance: 0,
          currency: "USD",
          totalEarned: 0,
          totalSpent: 0,
          pendingBalance: 0,
        }).returning();
      }

      await tx.update(walletsTable).set({
        balance: wallet.balance + assignment.reward,
        totalEarned: wallet.totalEarned + assignment.reward,
      }).where(eq(walletsTable.id, wallet.id));

      await tx.insert(transactionsTable).values({
        walletId: wallet.id,
        type: "task_reward",
        amount: assignment.reward,
        status: "completed",
        description: `Manual review approved - assignment #${assignment.id}`,
        reference: `assignment:${assignment.id}`,
      });

      await tx.update(campaignsTable).set({
        workersCompleted: sql`${campaignsTable.workersCompleted} + 1`,
        spent: sql`${campaignsTable.spent} + ${assignment.reward}`,
      }).where(eq(campaignsTable.id, task.campaignId));

      const [clientWallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, campaign.clientId));
      if (clientWallet) {
        await tx.update(walletsTable).set({
          pendingBalance: Math.max(0, clientWallet.pendingBalance - assignment.reward),
          totalSpent: clientWallet.totalSpent + assignment.reward,
        }).where(eq(walletsTable.id, clientWallet.id));
      }

      await tx.update(tasksTable).set({ status: "completed" }).where(eq(tasksTable.id, task.id));

      // Broadcast notifications
      await broadcastNotification(createVerificationCompletedNotification(
        assignment.workerId,
        campaign.clientId,
        assignment.id,
        "approved",
        1.0
      ));
      await broadcastNotification(createWalletCreditedNotification(
        assignment.workerId,
        assignment.reward,
        wallet.balance + assignment.reward
      ));
    } else {
      await tx.update(tasksTable).set({ status: "available" }).where(eq(tasksTable.id, task.id));

      // Broadcast notification
      await broadcastNotification(createVerificationCompletedNotification(
        assignment.workerId,
        campaign.clientId,
        assignment.id,
        "rejected",
        0
      ));
    }

    await tx.insert(activityEventsTable).values({
      type: decision === "approved" ? "task_completed" : "task_rejected",
      description: `Manual review: task ${decision} by admin`,
      userId: assignment.workerId ?? null,
      taskId: assignment.taskId ?? null,
      amount: decision === "approved" ? (assignment.reward ?? null) : null,
    });

    return { verification, assignment };
  });

  await logManualReview(userId, verification.assignmentId, decision, notes ?? undefined);

  if (decision === "approved" && assignment.reward && assignment.workerId) {
    await logWalletTransaction(assignment.workerId, "worker", "wallet_payout", assignment.reward);
  }

  res.json(ReviewVerificationResponse.parse(formatVerification(verification)));
});

export default router;
