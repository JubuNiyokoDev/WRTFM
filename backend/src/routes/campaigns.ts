import { Router, type IRouter } from "express";
import { eq, and, desc, count, sum, avg, sql, inArray } from "drizzle-orm";
import { db, usersTable, campaignsTable, tasksTable, assignmentsTable, verificationsTable, walletsTable, transactionsTable } from "@/db";
import {
  ListCampaignsQueryParams,
  ListCampaignsResponse,
  CreateCampaignBody,
  CreateCampaignResponse,
  GetCampaignParams,
  GetCampaignResponse,
  UpdateCampaignParams,
  UpdateCampaignBody,
  UpdateCampaignResponse,
  DeleteCampaignParams,
  DeleteCampaignResponse,
  GetCampaignStatsParams,
  GetCampaignStatsResponse,
  GetCampaignTasksParams,
  GetCampaignTasksResponse,
} from "@/api-zod";
import { getUserIdFromToken } from "./auth";
import { logAuditEvent, logCampaignCreated } from "@/lib/audit-logger";

const router: IRouter = Router();

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

async function getCurrentUser(req: any) {
  const userId = getRequestUserId(req);
  if (!userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

async function generateCampaignTasks(tx: any, campaign: typeof campaignsTable.$inferSelect) {
  const [existing] = await tx.select({ count: count() }).from(tasksTable).where(eq(tasksTable.campaignId, campaign.id));
  const missing = Math.max(0, campaign.workersNeeded - (existing?.count ?? 0));
  if (missing === 0) return;

  await tx.insert(tasksTable).values(
    Array.from({ length: missing }).map((_, index) => ({
      campaignId: campaign.id,
      title: `${campaign.title} #${(existing?.count ?? 0) + index + 1}`,
      taskType: campaign.taskType,
      platform: campaign.platform,
      targetUrl: campaign.targetUrl,
      reward: campaign.rewardPerTask,
      status: "available" as const,
      instructions: campaign.instructions,
      proofRequirements: campaign.proofRequirements ?? [],
      estimatedMinutes: 5,
      deadline: campaign.deadline,
    })),
  );
}

router.get("/campaigns", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!["client", "admin"].includes(currentUser.role)) {
    res.status(403).json({ error: "Client or admin role required" });
    return;
  }

  const params = ListCampaignsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (status) conditions.push(eq(campaignsTable.status, status as any));
  if (currentUser.role !== "admin") conditions.push(eq(campaignsTable.clientId, currentUser.id));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [campaigns, countResult] = await Promise.all([
    db.select().from(campaignsTable)
      .where(whereClause)
      .orderBy(desc(campaignsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(campaignsTable).where(whereClause),
  ]);

  const items = campaigns.map((c) => ({
    ...c,
    targetUrl: c.targetUrl ?? undefined,
    deadline: c.deadline ? c.deadline.toISOString() : null,
    targetCountries: c.targetCountries ?? [],
    targetLanguages: c.targetLanguages ?? [],
    proofRequirements: c.proofRequirements ?? [],
  }));

  const data = ListCampaignsResponse.parse({
    items,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
  res.json(data);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!client || !["client", "admin"].includes(client.role)) {
    res.status(403).json({ error: "Client role required" });
    return;
  }

  const minimumBudget = data.rewardPerTask * data.workersNeeded;
  if (data.budget < minimumBudget) {
    res.status(400).json({ error: `Budget must cover all worker rewards. Minimum required: ${minimumBudget.toFixed(2)}` });
    return;
  }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet || wallet.balance < data.budget) {
    res.status(402).json({ error: "Insufficient wallet balance. Deposit funds before creating this campaign." });
    return;
  }

  const campaign = await db.transaction(async (tx) => {
    await tx.update(walletsTable).set({
      balance: wallet.balance - data.budget,
      pendingBalance: wallet.pendingBalance + data.budget,
    }).where(eq(walletsTable.id, wallet.id));

    const [created] = await tx.insert(campaignsTable).values({
      clientId: userId,
      title: data.title,
      description: data.description ?? "",
      taskType: data.taskType as any,
      platform: data.platform,
      targetUrl: data.targetUrl ?? null,
      budget: data.budget,
      spent: 0,
      rewardPerTask: data.rewardPerTask,
      workersNeeded: data.workersNeeded,
      workersCompleted: 0,
      targetCountries: data.targetCountries ?? [],
      targetLanguages: data.targetLanguages ?? [],
      deadline: data.deadline ? new Date(data.deadline) : null,
      instructions: data.instructions,
      proofRequirements: data.proofRequirements ?? [],
      automationRate: 0,
      status: "draft",
    }).returning();

    await tx.insert(transactionsTable).values({
      walletId: wallet.id,
      type: "task_payment",
      amount: data.budget,
      status: "pending",
      description: `Campaign budget reserved - ${created.title}`,
      reference: `campaign:${created.id}`,
    });

    return created;
  });

  await logCampaignCreated(userId, campaign.id, {
    title: campaign.title,
    budget: campaign.budget,
  });

  const result = CreateCampaignResponse.parse({
    ...campaign,
    targetUrl: campaign.targetUrl ?? undefined,
    deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
    targetCountries: campaign.targetCountries ?? [],
    targetLanguages: campaign.targetLanguages ?? [],
    proofRequirements: campaign.proofRequirements ?? [],
  });
  res.status(201).json(result);
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (currentUser.role !== "admin" && campaign.clientId !== currentUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const data = GetCampaignResponse.parse({
    ...campaign,
    targetUrl: campaign.targetUrl ?? undefined,
    deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
    targetCountries: campaign.targetCountries ?? [],
    targetLanguages: campaign.targetLanguages ?? [],
    proofRequirements: campaign.proofRequirements ?? [],
  });
  res.json(data);
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.budget !== undefined) {
    res.status(400).json({ error: "Campaign budget cannot be changed after reservation. Cancel and create a new campaign." });
    return;
  }

  const updateData: any = {};
  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.description) updateData.description = parsed.data.description;
  if (parsed.data.status) updateData.status = parsed.data.status;
  if (parsed.data.instructions) updateData.instructions = parsed.data.instructions;
  if (parsed.data.deadline) updateData.deadline = new Date(parsed.data.deadline);

  const [existingCampaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!existingCampaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (currentUser.role !== "admin" && existingCampaign.clientId !== currentUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const campaign = await db.transaction(async (tx) => {
    const [updated] = await tx.update(campaignsTable)
      .set(updateData)
      .where(eq(campaignsTable.id, params.data.id))
      .returning();

    if (parsed.data.status === "active" && existingCampaign.status !== "active") {
      await generateCampaignTasks(tx, updated);
    }

    if (parsed.data.status === "cancelled" && existingCampaign.status !== "cancelled") {
      const campaignTasks = await tx.select({ id: tasksTable.id }).from(tasksTable)
        .where(eq(tasksTable.campaignId, existingCampaign.id));
      const taskIds = campaignTasks.map((task: { id: number }) => task.id);

      if (taskIds.length > 0) {
        const openAssignments = await tx.select({ id: assignmentsTable.id }).from(assignmentsTable)
          .where(and(
            inArray(assignmentsTable.taskId, taskIds),
            inArray(assignmentsTable.status, ["pending", "in_progress", "submitted"]),
          ));
        const openAssignmentIds = openAssignments.map((assignment: { id: number }) => assignment.id);

        await tx.update(tasksTable).set({ status: "cancelled" })
          .where(and(
            eq(tasksTable.campaignId, existingCampaign.id),
            inArray(tasksTable.status, ["available", "in_progress"]),
          ));

        await tx.update(assignmentsTable).set({
          status: "expired",
          completedAt: new Date(),
        }).where(and(
          inArray(assignmentsTable.taskId, taskIds),
          inArray(assignmentsTable.status, ["pending", "in_progress", "submitted"]),
        ));

        if (openAssignmentIds.length > 0) {
          await tx.update(verificationsTable).set({
            status: "rejected",
            reviewNotes: "Campaign cancelled before review completion",
            reviewedAt: new Date(),
            method: "hybrid",
          }).where(and(
            inArray(verificationsTable.assignmentId, openAssignmentIds),
            eq(verificationsTable.status, "manual_review"),
          ));
        }
      }

      const refundable = Math.max(0, existingCampaign.budget - existingCampaign.spent);
      const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, existingCampaign.clientId));
      if (wallet && refundable > 0) {
        await tx.update(walletsTable).set({
          balance: wallet.balance + refundable,
          pendingBalance: Math.max(0, wallet.pendingBalance - refundable),
        }).where(eq(walletsTable.id, wallet.id));

        await tx.insert(transactionsTable).values({
          walletId: wallet.id,
          type: "refund",
          amount: refundable,
          status: "completed",
          description: `Campaign refund - ${existingCampaign.title}`,
          reference: `campaign:${existingCampaign.id}`,
        });
      }
    }

    return updated;
  });

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  if (parsed.data.status === "active" && existingCampaign.status !== "active") {
    await logAuditEvent({
      userId: currentUser.id,
      userType: currentUser.role as any,
      action: "campaign_activated",
      resourceType: "campaign",
      resourceId: campaign.id,
      success: true,
    });
  } else if (parsed.data.status === "cancelled" && existingCampaign.status !== "cancelled") {
    await logAuditEvent({
      userId: currentUser.id,
      userType: currentUser.role as any,
      action: "campaign_cancelled",
      resourceType: "campaign",
      resourceId: campaign.id,
      success: true,
    });
  }

  const data = UpdateCampaignResponse.parse({
    ...campaign,
    targetUrl: campaign.targetUrl ?? undefined,
    deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
    targetCountries: campaign.targetCountries ?? [],
    targetLanguages: campaign.targetLanguages ?? [],
    proofRequirements: campaign.proofRequirements ?? [],
  });
  res.json(data);
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = DeleteCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existingCampaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));

  if (!existingCampaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (currentUser.role !== "admin" && existingCampaign.clientId !== currentUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.status(409).json(DeleteCampaignResponse.parse({
    message: "Campaign deletion is disabled to preserve audit history. Cancel the campaign to refund remaining reserved funds.",
  }));
});

router.get("/campaigns/:id/stats", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetCampaignStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const campaignId = params.data.id;
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (currentUser.role !== "admin" && campaign.clientId !== currentUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const tasks = await db.select({ id: tasksTable.id }).from(tasksTable)
    .where(eq(tasksTable.campaignId, campaignId));
  const taskIds = tasks.map((t) => t.id);

  if (taskIds.length === 0) {
    res.json(GetCampaignStatsResponse.parse({
      campaignId,
      totalAssignments: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      manualReview: 0,
      automationRate: 0,
      avgConfidenceScore: 0,
      totalPaid: 0,
      avgCompletionTime: 0,
      byCountry: [],
    }));
    return;
  }

  const assignments = await db.select({
    id: assignmentsTable.id,
    status: assignmentsTable.status,
    reward: assignmentsTable.reward,
    workerId: assignmentsTable.workerId,
  }).from(assignmentsTable)
    .where(inArray(assignmentsTable.taskId, taskIds));

  const verifications = await db.select({
    status: verificationsTable.status,
    confidenceScore: verificationsTable.confidenceScore,
    method: verificationsTable.method,
    assignmentId: verificationsTable.assignmentId,
  }).from(verificationsTable)
    .where(assignments.length > 0 ? inArray(verificationsTable.assignmentId, assignments.map(a => a.id)) : sql`false`);

  const approved = verifications.filter(v => v.status === "approved" || v.status === "auto_approved").length;
  const rejected = verifications.filter(v => v.status === "rejected" || v.status === "auto_rejected").length;
  const manualReview = verifications.filter(v => v.status === "manual_review").length;
  const pending = assignments.length - verifications.length;
  const approvedAssignmentIds = new Set(verifications
    .filter(v => v.status === "approved" || v.status === "auto_approved")
    .map(v => v.assignmentId));
  const totalPaid = assignments
    .filter(a => approvedAssignmentIds.has(a.id))
    .reduce((s, a) => s + (a.reward ?? 0), 0);
  const autoDecided = verifications.filter(v => v.method === "automatic").length;
  const automationRate = verifications.length > 0 ? autoDecided / verifications.length : 0;
  const avgConfidenceScore = verifications.length > 0
    ? verifications.reduce((s, v) => s + v.confidenceScore, 0) / verifications.length
    : 0;

  res.json(GetCampaignStatsResponse.parse({
    campaignId,
    totalAssignments: assignments.length,
    approved,
    rejected,
    pending,
    manualReview,
    automationRate: Math.round(automationRate * 100) / 100,
    avgConfidenceScore: Math.round(avgConfidenceScore * 100) / 100,
    totalPaid,
    avgCompletionTime: 0,
    byCountry: [],
  }));
});

router.get("/campaigns/:id/tasks", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetCampaignTasksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (currentUser.role !== "admin" && campaign.clientId !== currentUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const tasks = await db.select().from(tasksTable)
    .where(eq(tasksTable.campaignId, params.data.id))
    .orderBy(desc(tasksTable.createdAt));

  const items = tasks.map((t) => ({
    ...t,
    targetUrl: t.targetUrl ?? null,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    proofRequirements: t.proofRequirements ?? [],
    campaign: campaign ? {
      ...campaign,
      targetUrl: campaign.targetUrl ?? undefined,
      deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
      targetCountries: campaign.targetCountries ?? [],
      targetLanguages: campaign.targetLanguages ?? [],
      proofRequirements: campaign.proofRequirements ?? [],
    } : undefined,
  }));

  res.json(GetCampaignTasksResponse.parse(items));
});

export default router;
