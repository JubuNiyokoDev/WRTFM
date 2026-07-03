import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
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
} from "@workspace/db";
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
} from "@workspace/api-zod";
import { getUserIdFromToken } from "./auth";
import { runVerificationEngine } from "../lib/verification-engine";

const router: IRouter = Router();

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

async function enrichAssignment(assignment: any) {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, assignment.taskId));
  let campaign: any;
  if (task) {
    const [c] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, task.campaignId));
    campaign = c;
  }

  const [verification] = await db.select().from(verificationsTable)
    .where(eq(verificationsTable.assignmentId, assignment.id));

  return {
    ...assignment,
    submittedAt: assignment.submittedAt ? assignment.submittedAt.toISOString() : null,
    completedAt: assignment.completedAt ? assignment.completedAt.toISOString() : null,
    reward: assignment.reward ?? null,
    task: task ? {
      ...task,
      targetUrl: task.targetUrl ?? null,
      deadline: task.deadline ? task.deadline.toISOString() : null,
      proofRequirements: task.proofRequirements ?? [],
      campaign: campaign ? {
        ...campaign,
        targetUrl: campaign.targetUrl ?? null,
        deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
        targetCountries: campaign.targetCountries ?? [],
        targetLanguages: campaign.targetLanguages ?? [],
        proofRequirements: campaign.proofRequirements ?? [],
      } : undefined,
    } : undefined,
    verification: verification ? {
      ...verification,
      checks: verification.checks as any[] ?? [],
      reviewNotes: verification.reviewNotes ?? null,
      reviewedBy: verification.reviewedBy ?? null,
      reviewedAt: verification.reviewedAt ? verification.reviewedAt.toISOString() : null,
    } : undefined,
  };
}

router.get("/assignments", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  const params = ListAssignmentsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (userId) conditions.push(eq(assignmentsTable.workerId, userId));
  if (status) conditions.push(eq(assignmentsTable.status, status as any));

  const [assignments, countResult] = await Promise.all([
    db.select().from(assignmentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(assignmentsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(assignmentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const enriched = await Promise.all(assignments.map(enrichAssignment));

  res.json(ListAssignmentsResponse.parse({
    items: enriched,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  }));
});

router.post("/assignments", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
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
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task || task.status !== "available") {
    res.status(400).json({ error: "Task is not available" });
    return;
  }

  // Check worker hasn't already claimed this task
  const existing = await db.select().from(assignmentsTable)
    .where(and(eq(assignmentsTable.taskId, taskId), eq(assignmentsTable.workerId, userId)));
  if (existing.length > 0) {
    res.status(400).json({ error: "Task already claimed" });
    return;
  }

  const [assignment] = await db.insert(assignmentsTable).values({
    taskId,
    workerId: userId,
    status: "in_progress",
    reward: task.reward,
  }).returning();

  // Update task status
  await db.update(tasksTable).set({ status: "in_progress" }).where(eq(tasksTable.id, taskId));

  res.status(201).json(ClaimTaskResponse.parse(await enrichAssignment(assignment)));
});

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

  const [assignment] = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.id, params.data.id));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  // Check ownership or admin role
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (assignment.workerId !== userId && user?.role !== "admin") {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(GetAssignmentResponse.parse(await enrichAssignment(assignment)));
});

router.post("/assignments/:id/submit", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = SubmitProofParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitProofBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const assignmentId = params.data.id;
  const [assignment] = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId));

  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  // Only the assigned worker can submit proof
  if (assignment.workerId !== userId) {
    res.status(403).json({ error: "You can only submit proof for your own assignments" });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, assignment.taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Save proof
  await db.insert(proofsTable).values({
    assignmentId,
    proofType: parsed.data.proofType as any,
    screenshotUrl: parsed.data.screenshotUrl ?? null,
    link: parsed.data.link ?? null,
    username: parsed.data.username ?? null,
    code: parsed.data.code ?? null,
    description: parsed.data.description ?? null,
    additionalData: parsed.data.additionalData ?? null,
  });

  // Run verification engine
  const engineResult = runVerificationEngine(
    task.taskType,
    task.proofRequirements ?? [],
    parsed.data,
  );

  // Save verification result
  const [verification] = await db.insert(verificationsTable).values({
    assignmentId,
    status: engineResult.status,
    confidenceScore: engineResult.confidenceScore,
    method: engineResult.method,
    checks: engineResult.checks,
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
  }).returning();

  // Update assignment status
  const assignmentStatus = engineResult.status === "auto_approved" ? "approved"
    : engineResult.status === "auto_rejected" ? "rejected"
    : "submitted";

  await db.update(assignmentsTable).set({
    status: assignmentStatus,
    submittedAt: new Date(),
    completedAt: engineResult.status !== "manual_review" ? new Date() : null,
  }).where(eq(assignmentsTable.id, assignmentId));

  // If approved, pay the worker
  if (engineResult.status === "auto_approved" && assignment.reward) {
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
        description: `Task reward for assignment #${assignmentId}`,
      });
    }

    // Update campaign stats
    await db.update(campaignsTable).set({
      workersCompleted: sql`${campaignsTable.workersCompleted} + 1`,
      spent: sql`${campaignsTable.spent} + ${assignment.reward}`,
    }).where(eq(campaignsTable.id, task.campaignId));
  }

  // Update task status
  if (engineResult.status !== "manual_review") {
    await db.update(tasksTable).set({ status: "completed" }).where(eq(tasksTable.id, task.id));
  }

  // Log activity event
  const [worker] = await db.select().from(usersTable).where(eq(usersTable.id, assignment.workerId));
  await db.insert(activityEventsTable).values({
    type: engineResult.status === "auto_approved" ? "task_completed"
      : engineResult.status === "auto_rejected" ? "task_rejected"
      : "manual_review_needed",
    description: engineResult.status === "auto_approved"
      ? `Task completed and auto-approved (${Math.round(engineResult.confidenceScore * 100)}% confidence)`
      : engineResult.status === "auto_rejected"
      ? `Task auto-rejected (${Math.round(engineResult.confidenceScore * 100)}% confidence)`
      : `Task submitted for manual review (${Math.round(engineResult.confidenceScore * 100)}% confidence)`,
    userId: assignment.workerId,
    userName: worker?.name ?? null,
    taskId: task.id,
    amount: engineResult.status === "auto_approved" ? assignment.reward ?? null : null,
  });

  res.json(SubmitProofResponse.parse({
    ...verification,
    checks: verification.checks as any[] ?? [],
    reviewNotes: verification.reviewNotes ?? null,
    reviewedBy: verification.reviewedBy ?? null,
    reviewedAt: verification.reviewedAt ? verification.reviewedAt.toISOString() : null,
  }));
});

export default router;
