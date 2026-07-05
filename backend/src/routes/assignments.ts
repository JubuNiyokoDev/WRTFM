import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql, inArray } from "drizzle-orm";
import multer from "multer";
import {
  db,
  tasksTable,
  campaignsTable,
  assignmentsTable,
  proofsTable,
  verificationsTable,
  activityEventsTable,
  walletsTable,
  transactionsTable,
  usersTable,
} from "@/db";
import {
  ListAssignmentsQueryParams,
  ListAssignmentsResponse,
  ClaimTaskBody,
  ClaimTaskResponse,
  GetAssignmentParams,
  GetAssignmentResponse,
  SubmitProofParams,
  SubmitProofBody,
  SubmitProofResponse,
} from "@/api-zod";
import { getUserIdFromToken } from "./auth";
import { runVerificationEngine } from "../lib/verification-engine";
import {
  logTaskClaimed,
  logProofSubmitted,
  logVerificationCompleted,
  logWalletTransaction,
} from "@/lib/audit-logger";
import { fetchProofFile, uploadProofFile } from "@/lib/appwrite-storage";
import { requireAuth, requireRole } from "@/middlewares/auth";
import { uploadRateLimit } from "@/middlewares/rate-limit";
import {
  broadcastNotification,
  createProofSubmittedNotification,
  createVerificationCompletedNotification,
  createManualReviewNeededNotification,
  createWalletCreditedNotification,
  createTaskClaimedNotification,
} from "@/lib/notifications";

const router: IRouter = Router();
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.PROOF_MAX_FILE_BYTES ?? 8 * 1024 * 1024),
  },
  fileFilter(_req, file, callback) {
    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ]);
    if (!allowedTypes.has(file.mimetype)) {
      callback(new Error("Unsupported proof file type"));
      return;
    }
    callback(null, true);
  },
});

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

async function enrichAssignment(assignment: any) {
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, assignment.taskId));
  let campaign: any;
  if (task) {
    const [c] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, task.campaignId));
    campaign = c;
  }

  const [verification] = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.assignmentId, assignment.id));

  return {
    ...assignment,
    submittedAt: assignment.submittedAt
      ? assignment.submittedAt.toISOString()
      : null,
    completedAt: assignment.completedAt
      ? assignment.completedAt.toISOString()
      : null,
    reward: assignment.reward ?? null,
    task: task
      ? {
          ...task,
          targetUrl: task.targetUrl ?? null,
          deadline: task.deadline ? task.deadline.toISOString() : null,
          proofRequirements: task.proofRequirements ?? [],
          campaign: campaign
            ? {
                ...campaign,
                targetUrl: campaign.targetUrl ?? undefined,
                deadline: campaign.deadline
                  ? campaign.deadline.toISOString()
                  : null,
                targetCountries: campaign.targetCountries ?? [],
                targetLanguages: campaign.targetLanguages ?? [],
                proofRequirements: campaign.proofRequirements ?? [],
              }
            : undefined,
        }
      : undefined,
    verification: verification
      ? {
          ...verification,
          checks: (verification.checks as any[]) ?? [],
          reviewNotes: verification.reviewNotes ?? null,
          reviewedBy: verification.reviewedBy ?? null,
          reviewedAt: verification.reviewedAt
            ? verification.reviewedAt.toISOString()
            : null,
        }
      : undefined,
  };
}

async function getCurrentUser(req: any) {
  const userId = getRequestUserId(req);
  if (!userId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

function parseAdditionalData(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeProofBody(
  req: any,
  uploadedFile?: Awaited<ReturnType<typeof uploadProofFile>>,
) {
  const additionalData = {
    ...parseAdditionalData(req.body.additionalData),
    ...(uploadedFile
      ? {
          appwriteFileId: uploadedFile.fileId,
          appwriteBucketId: uploadedFile.bucketId,
          originalName: uploadedFile.originalName,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.size,
          sha256: uploadedFile.sha256,
          storageProvider: "appwrite",
        }
      : {}),
  };

  return {
    proofType: req.body.proofType ?? (uploadedFile ? "combined" : undefined),
    screenshotUrl: uploadedFile?.viewUrl ?? req.body.screenshotUrl ?? undefined,
    link: req.body.link || undefined,
    username: req.body.username || undefined,
    code: req.body.code || undefined,
    description: req.body.description || undefined,
    additionalData,
  };
}

async function canAccessProofFile(
  userId: number,
  fileId: string,
): Promise<boolean> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return false;
  if (user.role === "admin") return true;

  const [proof] = await db
    .select()
    .from(proofsTable)
    .where(sql`${proofsTable.additionalData}->>'appwriteFileId' = ${fileId}`)
    .limit(1);
  if (!proof) return false;

  const [assignment] = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, proof.assignmentId));
  if (!assignment) return false;
  if (assignment.workerId === userId) return true;

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, assignment.taskId));
  if (!task) return false;
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, task.campaignId));
  return campaign?.clientId === userId;
}

router.get("/assignments", requireAuth, async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role === "client") {
    res
      .status(403)
      .json({ error: "Clients must use campaign reporting endpoints" });
    return;
  }

  const params = ListAssignmentsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (currentUser.role === "worker")
    conditions.push(eq(assignmentsTable.workerId, currentUser.id));
  if (status) conditions.push(eq(assignmentsTable.status, status as any));

  const [assignments, countResult] = await Promise.all([
    db
      .select()
      .from(assignmentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(assignmentsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(assignmentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const enriched = await Promise.all(assignments.map(enrichAssignment));

  res.json(
    ListAssignmentsResponse.parse({
      items: enriched,
      total: countResult[0]?.count ?? 0,
      page,
      limit,
    }),
  );
});

router.post(
  "/assignments",
  requireAuth,
  requireRole("worker"),
  async (req, res): Promise<void> => {
    const userId = (req as any).userId as number | undefined;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = ClaimTaskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { taskId } = parsed.data;

    // Check task is available
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));
    if (!task || task.status !== "available") {
      res.status(400).json({ error: "Task is not available" });
      return;
    }

    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, task.campaignId));
    if (!campaign || campaign.status !== "active") {
      res.status(400).json({ error: "Campaign is not active" });
      return;
    }

    // Check worker hasn't already claimed this task
    const existing = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.taskId, taskId),
          eq(assignmentsTable.workerId, userId),
        ),
      );
    if (existing.length > 0) {
      res.status(400).json({ error: "Task already claimed" });
      return;
    }

    const [assignment] = await db
      .insert(assignmentsTable)
      .values({
        taskId,
        workerId: userId,
        status: "in_progress",
        reward: task.reward,
      })
      .returning();

    // Update task status
    await db
      .update(tasksTable)
      .set({ status: "in_progress" })
      .where(eq(tasksTable.id, taskId));

    // Broadcast notification
    await broadcastNotification(
      createTaskClaimedNotification(userId, taskId, task.campaignId),
    );

    // Log audit event
    await logTaskClaimed(userId, taskId, task.campaignId);

    res
      .status(201)
      .json(ClaimTaskResponse.parse(await enrichAssignment(assignment)));
  },
);

router.get("/assignments/:id", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetAssignmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [assignment] = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, params.data.id));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  // Check ownership or admin role
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (assignment.workerId !== userId && user?.role !== "admin") {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(GetAssignmentResponse.parse(await enrichAssignment(assignment)));
});

router.get("/proof-files/:fileId/view", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const fileId = String(req.params.fileId ?? "");
  if (!/^[a-zA-Z0-9._-]{8,128}$/.test(fileId)) {
    res.status(400).json({ error: "Invalid file id" });
    return;
  }

  if (!(await canAccessProofFile(userId, fileId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const file = await fetchProofFile(fileId);
    if (file.contentType) res.setHeader("content-type", file.contentType);
    res.send(Buffer.from(file.body));
  } catch {
    res.status(404).json({ error: "Proof file not found" });
  }
});

router.post(
  "/assignments/:id/submit",
  requireAuth,
  requireRole("worker"),
  uploadRateLimit,
  proofUpload.single("screenshot"),
  async (req, res): Promise<void> => {
    const userId = (req as any).userId as number | undefined;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const params = SubmitProofParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    let uploadedFile: Awaited<ReturnType<typeof uploadProofFile>> | undefined;
    if (req.file) {
      try {
        uploadedFile = await uploadProofFile(req.file);
      } catch (error) {
        res.status(502).json({
          error:
            error instanceof Error ? error.message : "Proof file upload failed",
        });
        return;
      }
    }

    const parsed = SubmitProofBody.safeParse(
      normalizeProofBody(req, uploadedFile),
    );
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const assignmentId = params.data.id;
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, assignmentId));

    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    // Only the assigned worker can submit proof
    if (assignment.workerId !== userId) {
      res
        .status(403)
        .json({ error: "You can only submit proof for your own assignments" });
      return;
    }
    if (
      assignment.status !== "in_progress" &&
      assignment.status !== "correction_requested"
    ) {
      res.status(409).json({
        error:
          "Proof can only be submitted for an in-progress or correction-requested assignment",
      });
      return;
    }

    const [task] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, assignment.taskId));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.status !== "in_progress") {
      res.status(409).json({ error: "Task is no longer accepting proof" });
      return;
    }
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, task.campaignId));
    if (!campaign || campaign.status === "cancelled") {
      res.status(409).json({ error: "Campaign is no longer accepting proof" });
      return;
    }

    const proofAdditionalData = parseAdditionalData(parsed.data.additionalData);

    // Generate content hash for duplicate detection
    const { generateProofHash } = await import("../lib/proof-hash.js");
    const contentHash = generateProofHash({
      screenshotUrl: parsed.data.screenshotUrl ?? null,
      link: parsed.data.link ?? null,
      username: parsed.data.username ?? null,
      code: parsed.data.code ?? null,
      description: parsed.data.description ?? null,
    });

    // Check for duplicate proofs using contentHash
    const { checkForDuplicateProof } =
      await import("../lib/duplicate-checker.js");
    const duplicateCheckResult = await checkForDuplicateProof(
      contentHash,
      assignment.workerId,
      assignmentId,
    );

    // Save proof
    await db.insert(proofsTable).values({
      assignmentId,
      proofType: parsed.data.proofType as any,
      screenshotUrl: parsed.data.screenshotUrl ?? null,
      link: parsed.data.link ?? null,
      username: parsed.data.username ?? null,
      code: parsed.data.code ?? null,
      description: parsed.data.description ?? null,
      contentHash,
      additionalData: {
        ...proofAdditionalData,
        duplicateDetected: duplicateCheckResult.hasDuplicate,
      },
    });

    // Broadcast notification for proof submission
    await broadcastNotification(
      createProofSubmittedNotification(userId, assignmentId, task.id),
    );

    // Log audit event
    await logProofSubmitted(userId, assignmentId, task.id);

    // Run verification engine
    // Fetch worker reputation info
    const [workerInfo] = await db
      .select({
        reputationScore: usersTable.reputationScore,
      })
      .from(usersTable)
      .where(eq(usersTable.id, assignment.workerId));

    // Fetch client history info history info
    const [client] = await db
      .select({
        id: usersTable.id,
      })
      .from(usersTable)
      .where(eq(usersTable.id, campaign.clientId));

    // Get client stats
    const clientCampaigns = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.clientId, campaign.clientId));
    const clientCampaignIds = clientCampaigns.map((c) => c.id);

    let clientTotalDisputes = 0;
    let clientAvgAutoRate = 0.5;

    if (clientCampaignIds.length > 0) {
      const clientTasks = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(inArray(tasksTable.campaignId, clientCampaignIds));
      const clientTaskIds = clientTasks.map((t) => t.id);

      if (clientTaskIds.length > 0) {
        const clientAssignments = await db
          .select({ id: assignmentsTable.id })
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.taskId, clientTaskIds));
        const clientAssignmentIds = clientAssignments.map((a) => a.id);

        if (clientAssignmentIds.length > 0) {
          const clientVerifications = await db
            .select({
              status: verificationsTable.status,
            })
            .from(verificationsTable)
            .where(
              inArray(verificationsTable.assignmentId, clientAssignmentIds),
            );

          const autoApproved = clientVerifications.filter(
            (v) => v.status === "auto_approved" || v.status === "approved",
          ).length;
          const autoRejected = clientVerifications.filter(
            (v) => v.status === "auto_rejected" || v.status === "rejected",
          ).length;
          const totalDecided = autoApproved + autoRejected;

          clientAvgAutoRate =
            totalDecided > 0 ? autoApproved / totalDecided : 0.5;
        }
      }
    }

    const workerInfoObj = workerInfo
      ? {
          reputationScore: workerInfo.reputationScore ?? 0,
          totalCompleted: 0, // Would need to query completed assignments
          totalRejected: 0, // Would need to query rejected assignments
          workerId: assignment.workerId,
        }
      : undefined;

    const clientInfo = client
      ? {
          totalCampaigns: clientCampaigns.length,
          totalDisputes: clientTotalDisputes,
          avgAutoRate: clientAvgAutoRate,
        }
      : undefined;

    let engineResult = runVerificationEngine(
      task.taskType,
      task.proofRequirements ?? [],
      {
        ...parsed.data,
        contentHash,
      },
      workerInfoObj,
      clientInfo,
      duplicateCheckResult.hasDuplicate ? duplicateCheckResult : undefined,
    );

    // Save verification result
    const [verification] = await db
      .insert(verificationsTable)
      .values({
        assignmentId,
        status: engineResult.status,
        confidenceScore: engineResult.confidenceScore,
        method: engineResult.method,
        checks: engineResult.checks,
        reviewNotes: null,
        reviewedBy: null,
        reviewedAt: null,
      })
      .returning();

    // Log audit event
    await logVerificationCompleted(
      assignmentId,
      engineResult.status,
      engineResult.confidenceScore,
    );

    // Update assignment status
    const assignmentStatus =
      engineResult.status === "auto_approved"
        ? "approved"
        : engineResult.status === "auto_rejected"
          ? "rejected"
          : "submitted";

    await db
      .update(assignmentsTable)
      .set({
        status: assignmentStatus,
        submittedAt: new Date(),
        completedAt:
          engineResult.status !== "manual_review" ? new Date() : null,
      })
      .where(eq(assignmentsTable.id, assignmentId));

    await db.transaction(async (tx) => {
      if (engineResult.status === "auto_approved" && assignment.reward) {
        let [wallet] = await tx
          .select()
          .from(walletsTable)
          .where(eq(walletsTable.userId, assignment.workerId));
        if (!wallet) {
          [wallet] = await tx
            .insert(walletsTable)
            .values({
              userId: assignment.workerId,
              balance: 0,
              currency: "USD",
              totalEarned: 0,
              totalSpent: 0,
              pendingBalance: 0,
            })
            .returning();
        }

        await tx
          .update(walletsTable)
          .set({
            balance: wallet.balance + assignment.reward,
            totalEarned: wallet.totalEarned + assignment.reward,
          })
          .where(eq(walletsTable.id, wallet.id));

        await tx.insert(transactionsTable).values({
          walletId: wallet.id,
          type: "task_reward",
          amount: assignment.reward,
          status: "completed",
          description: `Task reward for assignment #${assignmentId}`,
          reference: `assignment:${assignmentId}`,
        });

        await tx
          .update(campaignsTable)
          .set({
            workersCompleted: sql`${campaignsTable.workersCompleted} + 1`,
            spent: sql`${campaignsTable.spent} + ${assignment.reward}`,
          })
          .where(eq(campaignsTable.id, task.campaignId));

        const [campaign] = await tx
          .select()
          .from(campaignsTable)
          .where(eq(campaignsTable.id, task.campaignId));
        if (campaign) {
          const [clientWallet] = await tx
            .select()
            .from(walletsTable)
            .where(eq(walletsTable.userId, campaign.clientId));
          if (clientWallet) {
            await tx
              .update(walletsTable)
              .set({
                pendingBalance: Math.max(
                  0,
                  clientWallet.pendingBalance - assignment.reward,
                ),
                totalSpent: clientWallet.totalSpent + assignment.reward,
              })
              .where(eq(walletsTable.id, clientWallet.id));
          }
        }

        await tx
          .update(tasksTable)
          .set({ status: "completed" })
          .where(eq(tasksTable.id, task.id));

        // Broadcast notifications
        await broadcastNotification(
          createVerificationCompletedNotification(
            assignment.workerId,
            campaign.clientId,
            assignmentId,
            "auto_approved",
            engineResult.confidenceScore,
          ),
        );
        await broadcastNotification(
          createWalletCreditedNotification(
            assignment.workerId,
            assignment.reward,
            wallet.balance + assignment.reward,
          ),
        );
        return;
      }

      if (engineResult.status === "auto_rejected") {
        await tx
          .update(tasksTable)
          .set({ status: "available" })
          .where(eq(tasksTable.id, task.id));

        // Broadcast notification
        await broadcastNotification(
          createVerificationCompletedNotification(
            assignment.workerId,
            campaign.clientId,
            assignmentId,
            "auto_rejected",
            engineResult.confidenceScore,
          ),
        );
      }
    });

    if (engineResult.status === "auto_approved" && assignment.reward) {
      await logWalletTransaction(
        assignment.workerId,
        "worker",
        "wallet_payout",
        assignment.reward,
      );
    }

    // Broadcast manual review notification if needed
    if (engineResult.status === "manual_review") {
      await broadcastNotification(
        createManualReviewNeededNotification(
          true,
          assignmentId,
          engineResult.confidenceScore,
        ),
      );
    }

    // Log activity event
    const [worker] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, assignment.workerId));
    await db.insert(activityEventsTable).values({
      type:
        engineResult.status === "auto_approved"
          ? "task_completed"
          : engineResult.status === "auto_rejected"
            ? "task_rejected"
            : "manual_review_needed",
      description:
        engineResult.status === "auto_approved"
          ? `Task completed and auto-approved (${Math.round(engineResult.confidenceScore * 100)}% confidence)`
          : engineResult.status === "auto_rejected"
            ? `Task auto-rejected (${Math.round(engineResult.confidenceScore * 100)}% confidence)`
            : `Task submitted for manual review (${Math.round(engineResult.confidenceScore * 100)}% confidence)`,
      userId: assignment.workerId,
      userName: worker?.name ?? null,
      taskId: task.id,
      amount:
        engineResult.status === "auto_approved"
          ? (assignment.reward ?? null)
          : null,
    });

    res.json(
      SubmitProofResponse.parse({
        ...verification,
        checks: (verification.checks as any[]) ?? [],
        reviewNotes: verification.reviewNotes ?? null,
        reviewedBy: verification.reviewedBy ?? null,
        reviewedAt: verification.reviewedAt
          ? verification.reviewedAt.toISOString()
          : null,
      }),
    );
  },
);

export default router;
