import { Router, type IRouter } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db, verificationsTable, assignmentsTable, activityEventsTable, walletsTable, transactionsTable, tasksTable, usersTable } from "@workspace/db";
import {
  ListVerificationsQueryParams,
  ListVerificationsResponse,
  GetVerificationParams,
  GetVerificationResponse,
  ReviewVerificationParams,
  ReviewVerificationBody,
  ReviewVerificationResponse,
} from "@workspace/api-zod";
import { getUserIdFromToken } from "./auth";

const router: IRouter = Router();

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

function formatVerification(v: any) {
  return {
    ...v,
    checks: v.checks as any[] ?? [],
    reviewNotes: v.reviewNotes ?? null,
    reviewedBy: v.reviewedBy ?? null,
    reviewedAt: v.reviewedAt ? v.reviewedAt.toISOString() : null,
  };
}

router.get("/verifications", async (req, res): Promise<void> => {
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

router.get("/verifications/:id", async (req, res): Promise<void> => {
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

router.post("/verifications/:id/review", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Require admin role
  const [reviewer] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (!reviewer || reviewer.role !== "admin") {
    res.status(403).json({ error: "Admin role required to review verifications" });
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

  const { decision, notes } = parsed.data;
  const newStatus = decision === "approved" ? "approved" : "rejected";

  const [verification] = await db.update(verificationsTable).set({
    status: newStatus,
    reviewNotes: notes ?? null,
    reviewedBy: userId,
    reviewedAt: new Date(),
    method: "hybrid",
  }).where(eq(verificationsTable.id, params.data.id)).returning();

  if (!verification) {
    res.status(404).json({ error: "Verification not found" });
    return;
  }

  // Update assignment status
  const assignmentStatus = decision === "approved" ? "approved" : "rejected";
  const [assignment] = await db.update(assignmentsTable).set({
    status: assignmentStatus,
    completedAt: new Date(),
  }).where(eq(assignmentsTable.id, verification.assignmentId)).returning();

  // If approved, pay the worker
  if (decision === "approved" && assignment?.reward && assignment.workerId) {
    const [wallet] = await db.select().from(walletsTable)
      .where(eq(walletsTable.userId, assignment.workerId));
    if (wallet) {
      await db.update(walletsTable).set({
        balance: wallet.balance + assignment.reward,
        totalEarned: wallet.totalEarned + assignment.reward,
      }).where(eq(walletsTable.id, wallet.id));

      await db.insert(transactionsTable).values({
        walletId: wallet.id,
        type: "task_reward",
        amount: assignment.reward,
        status: "completed",
        description: `Manual review approved - assignment #${assignment.id}`,
      });
    }
  }

  // Log activity
  await db.insert(activityEventsTable).values({
    type: decision === "approved" ? "task_completed" : "task_rejected",
    description: `Manual review: task ${decision} by admin`,
    userId: assignment?.workerId ?? null,
    taskId: assignment?.taskId ?? null,
    amount: decision === "approved" ? (assignment?.reward ?? null) : null,
  });

  res.json(ReviewVerificationResponse.parse(formatVerification(verification)));
});

export default router;
