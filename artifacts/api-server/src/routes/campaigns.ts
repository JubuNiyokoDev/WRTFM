import { Router, type IRouter } from "express";
import { eq, and, desc, count, sum, avg, sql } from "drizzle-orm";
import { db, usersTable, campaignsTable, tasksTable, assignmentsTable, verificationsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { getUserIdFromToken } from "./auth";

const router: IRouter = Router();

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

router.get("/campaigns", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  const params = ListCampaignsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  const whereClause = status ? eq(campaignsTable.status, status as any) : undefined;

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
    targetUrl: c.targetUrl ?? null,
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
  const [campaign] = await db.insert(campaignsTable).values({
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

  const result = CreateCampaignResponse.parse({
    ...campaign,
    targetUrl: campaign.targetUrl ?? null,
    deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
    targetCountries: campaign.targetCountries ?? [],
    targetLanguages: campaign.targetLanguages ?? [],
    proofRequirements: campaign.proofRequirements ?? [],
  });
  res.status(201).json(result);
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
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

  const data = GetCampaignResponse.parse({
    ...campaign,
    targetUrl: campaign.targetUrl ?? null,
    deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
    targetCountries: campaign.targetCountries ?? [],
    targetLanguages: campaign.targetLanguages ?? [],
    proofRequirements: campaign.proofRequirements ?? [],
  });
  res.json(data);
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
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

  const updateData: any = {};
  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.description) updateData.description = parsed.data.description;
  if (parsed.data.status) updateData.status = parsed.data.status;
  if (parsed.data.budget !== undefined) updateData.budget = parsed.data.budget;
  if (parsed.data.instructions) updateData.instructions = parsed.data.instructions;
  if (parsed.data.deadline) updateData.deadline = new Date(parsed.data.deadline);

  const [campaign] = await db.update(campaignsTable)
    .set(updateData)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const data = UpdateCampaignResponse.parse({
    ...campaign,
    targetUrl: campaign.targetUrl ?? null,
    deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
    targetCountries: campaign.targetCountries ?? [],
    targetLanguages: campaign.targetLanguages ?? [],
    proofRequirements: campaign.proofRequirements ?? [],
  });
  res.json(data);
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const params = DeleteCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db.delete(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json(DeleteCampaignResponse.parse({ message: "Campaign deleted" }));
});

router.get("/campaigns/:id/stats", async (req, res): Promise<void> => {
  const params = GetCampaignStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const campaignId = params.data.id;

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
    .where(sql`${assignmentsTable.taskId} = ANY(${taskIds})`);

  const verifications = await db.select({
    status: verificationsTable.status,
    confidenceScore: verificationsTable.confidenceScore,
    method: verificationsTable.method,
    assignmentId: verificationsTable.assignmentId,
  }).from(verificationsTable)
    .where(sql`${verificationsTable.assignmentId} = ANY(${assignments.map(a => a.id)})`);

  const approved = verifications.filter(v => v.status === "approved" || v.status === "auto_approved").length;
  const rejected = verifications.filter(v => v.status === "rejected" || v.status === "auto_rejected").length;
  const manualReview = verifications.filter(v => v.status === "manual_review").length;
  const pending = assignments.length - verifications.length;
  const totalPaid = assignments.reduce((s, a) => s + (a.reward ?? 0), 0);
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
    avgCompletionTime: 7.5,
    byCountry: [],
  }));
});

router.get("/campaigns/:id/tasks", async (req, res): Promise<void> => {
  const params = GetCampaignTasksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const tasks = await db.select().from(tasksTable)
    .where(eq(tasksTable.campaignId, params.data.id))
    .orderBy(desc(tasksTable.createdAt));

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));

  const items = tasks.map((t) => ({
    ...t,
    targetUrl: t.targetUrl ?? null,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    proofRequirements: t.proofRequirements ?? [],
    campaign: campaign ? {
      ...campaign,
      targetUrl: campaign.targetUrl ?? null,
      deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
      targetCountries: campaign.targetCountries ?? [],
      targetLanguages: campaign.targetLanguages ?? [],
      proofRequirements: campaign.proofRequirements ?? [],
    } : undefined,
  }));

  res.json(GetCampaignTasksResponse.parse(items));
});

export default router;
