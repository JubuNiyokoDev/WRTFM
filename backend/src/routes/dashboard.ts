import { Router, type IRouter } from "express";
import { eq, desc, count, sql, inArray, or } from "drizzle-orm";
import {
  db,
  usersTable,
  campaignsTable,
  tasksTable,
  assignmentsTable,
  verificationsTable,
  activityEventsTable,
  walletsTable,
} from "@/db";
import {
  GetClientSummaryResponse,
  GetWorkerSummaryResponse,
  GetAdminSummaryResponse,
  GetActivityFeedQueryParams,
  GetActivityFeedResponse,
  GetAutomationStatsResponse,
  GetTaskTypeBreakdownResponse,
} from "@/api-zod";
import { getUserIdFromToken } from "./auth";

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

async function getVisibleCampaignIds(user: any): Promise<number[]> {
  if (user.role === "admin") {
    const campaigns = await db.select({ id: campaignsTable.id }).from(campaignsTable);
    return campaigns.map((campaign) => campaign.id);
  }
  if (user.role === "client") {
    const campaigns = await db.select({ id: campaignsTable.id }).from(campaignsTable)
      .where(eq(campaignsTable.clientId, user.id));
    return campaigns.map((campaign) => campaign.id);
  }
  return [];
}

async function getVisibleTaskIds(user: any): Promise<number[]> {
  if (user.role === "worker") {
    const assignments = await db.select({ taskId: assignmentsTable.taskId }).from(assignmentsTable)
      .where(eq(assignmentsTable.workerId, user.id));
    return [...new Set(assignments.map((assignment) => assignment.taskId))];
  }

  const campaignIds = await getVisibleCampaignIds(user);
  if (campaignIds.length === 0) return [];
  const tasks = await db.select({ id: tasksTable.id }).from(tasksTable)
    .where(inArray(tasksTable.campaignId, campaignIds));
  return tasks.map((task) => task.id);
}

async function getVisibleAssignmentIds(user: any): Promise<number[]> {
  if (user.role === "worker") {
    const assignments = await db.select({ id: assignmentsTable.id }).from(assignmentsTable)
      .where(eq(assignmentsTable.workerId, user.id));
    return assignments.map((assignment) => assignment.id);
  }

  const taskIds = await getVisibleTaskIds(user);
  if (taskIds.length === 0) return [];
  const assignments = await db.select({ id: assignmentsTable.id }).from(assignmentsTable)
    .where(inArray(assignmentsTable.taskId, taskIds));
  return assignments.map((assignment) => assignment.id);
}

function formatCampaign(c: any) {
  return {
    ...c,
    targetUrl: c.targetUrl ?? undefined,
    deadline: c.deadline ? c.deadline.toISOString() : null,
    targetCountries: c.targetCountries ?? [],
    targetLanguages: c.targetLanguages ?? [],
    proofRequirements: c.proofRequirements ?? [],
  };
}

function formatTask(t: any) {
  return {
    ...t,
    targetUrl: t.targetUrl ?? undefined,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    proofRequirements: t.proofRequirements ?? [],
  };
}

function formatAssignment(a: any) {
  return {
    ...a,
    submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    reward: a.reward ?? null,
  };
}

router.get("/dashboard/client-summary", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const currentUser = await getCurrentUser(req);
  if (!currentUser || currentUser.role !== "client") {
    res.status(403).json({ error: "Client role required" });
    return;
  }

  const campaigns = await db.select().from(campaignsTable)
    .where(eq(campaignsTable.clientId, userId))
    .orderBy(desc(campaignsTable.createdAt));

  const activeCampaigns = campaigns.filter(c => c.status === "active").length;

  const tasks = await db.select({ id: tasksTable.id }).from(tasksTable)
    .where(sql`${tasksTable.campaignId} IN (${campaigns.map(c => c.id).concat([0]).join(",")})`);

  const assignments = await db.select().from(assignmentsTable)
    .where(sql`${assignmentsTable.taskId} IN (${tasks.map(t => t.id).concat([0]).join(",")})`);

  const verifications = await db.select({
    status: verificationsTable.status,
    method: verificationsTable.method,
  }).from(verificationsTable)
    .where(sql`${verificationsTable.assignmentId} IN (${assignments.map(a => a.id).concat([0]).join(",")})`);

  const totalTasksCompleted = assignments.filter(a => a.status === "approved").length;
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);

  const autoDecided = verifications.filter(v => v.method === "automatic").length;
  const automationRate = verifications.length > 0 ? autoDecided / verifications.length : 0;
  const pendingVerifications = verifications.filter(v => v.status === "manual_review").length;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));

  const topCampaign = campaigns.sort((a, b) => b.workersCompleted - a.workersCompleted)[0];

  res.json(GetClientSummaryResponse.parse({
    activeCampaigns,
    totalCampaigns: campaigns.length,
    totalTasksPublished: tasks.length,
    totalTasksCompleted,
    totalSpent,
    walletBalance: wallet?.balance ?? 0,
    automationRate: Math.round(automationRate * 100) / 100,
    pendingVerifications,
    topPerformingCampaign: topCampaign ? formatCampaign(topCampaign) : undefined,
    recentCampaigns: campaigns.slice(0, 5).map(formatCampaign),
  }));
});

router.get("/dashboard/worker-summary", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const currentUser = await getCurrentUser(req);
  if (!currentUser || currentUser.role !== "worker") {
    res.status(403).json({ error: "Worker role required" });
    return;
  }

  const assignments = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.workerId, userId))
    .orderBy(desc(assignmentsTable.createdAt));

  const tasksCompleted = assignments.filter(a => a.status === "approved").length;
  const tasksInProgress = assignments.filter(a => a.status === "in_progress").length;
  const totalEarned = assignments.filter(a => a.status === "approved").reduce((s, a) => s + (a.reward ?? 0), 0);
  const pendingEarnings = assignments.filter(a => a.status === "submitted").reduce((s, a) => s + (a.reward ?? 0), 0);

  const validationRate = assignments.length > 0 ? tasksCompleted / assignments.length : 0;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));

  const score = user?.reputationScore ?? 0;
  let reputationLevel: string;
  if (score >= 90) reputationLevel = "platinum";
  else if (score >= 70) reputationLevel = "gold";
  else if (score >= 50) reputationLevel = "silver";
  else if (score >= 20) reputationLevel = "bronze";
  else reputationLevel = "newcomer";

  const activeCampaigns = await db.select({ id: campaignsTable.id }).from(campaignsTable)
    .where(eq(campaignsTable.status, "active"));
  const activeCampaignIds = activeCampaigns.map((campaign) => campaign.id);
  const availableTasks = activeCampaignIds.length === 0 ? [] : await db.select().from(tasksTable)
    .where(sql`${tasksTable.status} = 'available' AND ${tasksTable.campaignId} = ANY(${activeCampaignIds})`)
    .orderBy(desc(tasksTable.createdAt))
    .limit(5);

  const recentAssignments = assignments.slice(0, 5).map(formatAssignment);

  res.json(GetWorkerSummaryResponse.parse({
    tasksCompleted,
    tasksAvailable: availableTasks.length,
    tasksInProgress,
    totalEarned,
    pendingEarnings,
    walletBalance: wallet?.balance ?? 0,
    reputationScore: user?.reputationScore ?? 0,
    validationRate: Math.round(validationRate * 100) / 100,
    reputationLevel,
    recentAssignments,
    recommendedTasks: availableTasks.map(formatTask),
  }));
});

router.get("/dashboard/admin-summary", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin role required" }); return; }

  const [
    totalUsersResult,
    totalClientsResult,
    totalWorkersResult,
    totalCampaignsResult,
    totalTasksResult,
    totalVerificationsResult,
    pendingReviewsResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "client")),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "worker")),
    db.select({ count: count() }).from(campaignsTable),
    db.select({ count: count() }).from(tasksTable),
    db.select({ count: count() }).from(verificationsTable),
    db.select({ count: count() }).from(verificationsTable).where(eq(verificationsTable.status, "manual_review")),
  ]);

  const verifications = await db.select({
    method: verificationsTable.method,
    confidenceScore: verificationsTable.confidenceScore,
  }).from(verificationsTable);

  const autoDecided = verifications.filter(v => v.method === "automatic").length;
  const totalV = verifications.length;
  const automationRate = totalV > 0 ? autoDecided / totalV : 0;
  const avgConfidenceScore = totalV > 0
    ? verifications.reduce((s, v) => s + v.confidenceScore, 0) / totalV
    : 0;

  const wallets = await db.select({ totalEarned: walletsTable.totalEarned }).from(walletsTable);
  const totalVolume = wallets.reduce((s, w) => s + w.totalEarned, 0);

  res.json(GetAdminSummaryResponse.parse({
    totalUsers: totalUsersResult[0]?.count ?? 0,
    totalClients: totalClientsResult[0]?.count ?? 0,
    totalWorkers: totalWorkersResult[0]?.count ?? 0,
    totalCampaigns: totalCampaignsResult[0]?.count ?? 0,
    totalTasks: totalTasksResult[0]?.count ?? 0,
    totalVerifications: totalVerificationsResult[0]?.count ?? 0,
    automationRate: Math.round(automationRate * 100) / 100,
    pendingManualReviews: pendingReviewsResult[0]?.count ?? 0,
    totalVolume,
    avgConfidenceScore: Math.round(avgConfidenceScore * 100) / 100,
    newUsersToday: 0,
    tasksCompletedToday: 0,
  }));
});

router.get("/dashboard/activity-feed", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetActivityFeedQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const limit = params.data.limit ?? 20;

  const taskIds = await getVisibleTaskIds(currentUser);
  const campaignIds = await getVisibleCampaignIds(currentUser);
  const visibilityConditions: any[] = [];
  if (currentUser.role === "worker") visibilityConditions.push(eq(activityEventsTable.userId, currentUser.id));
  if (taskIds.length > 0) visibilityConditions.push(inArray(activityEventsTable.taskId, taskIds));
  if (campaignIds.length > 0) visibilityConditions.push(inArray(activityEventsTable.campaignId, campaignIds));

  if (currentUser.role !== "admin" && visibilityConditions.length === 0) {
    res.json(GetActivityFeedResponse.parse([]));
    return;
  }

  const events = await db.select().from(activityEventsTable)
    .where(currentUser.role === "admin" ? undefined : or(...visibilityConditions))
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(limit);

  res.json(GetActivityFeedResponse.parse(events.map(e => ({
    ...e,
    userId: e.userId ?? null,
    userName: e.userName ?? null,
    campaignId: e.campaignId ?? null,
    taskId: e.taskId ?? null,
    amount: e.amount ?? null,
  }))));
});

router.get("/dashboard/automation-stats", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const assignmentIds = await getVisibleAssignmentIds(currentUser);
  if (assignmentIds.length === 0) {
    res.json(GetAutomationStatsResponse.parse({
      overallRate: 0,
      autoApproved: 0,
      autoRejected: 0,
      manualReview: 0,
      totalProcessed: 0,
      avgProcessingMs: 0,
      byTaskType: [],
    }));
    return;
  }

  const verifications = await db.select({
    assignmentId: verificationsTable.assignmentId,
    status: verificationsTable.status,
    method: verificationsTable.method,
    confidenceScore: verificationsTable.confidenceScore,
  }).from(verificationsTable)
    .where(inArray(verificationsTable.assignmentId, assignmentIds));

  const autoApproved = verifications.filter(v => v.status === "auto_approved").length;
  const autoRejected = verifications.filter(v => v.status === "auto_rejected").length;
  const manualReview = verifications.filter(v => v.status === "manual_review" || v.status === "approved" || v.status === "rejected").length;
  const total = verifications.length;
  const automatedCount = autoApproved + autoRejected;
  const overallRate = total > 0 ? automatedCount / total : 0;

  // by task type — join with assignments → tasks
  const assignments = await db.select({
    id: assignmentsTable.id,
    taskId: assignmentsTable.taskId,
  }).from(assignmentsTable)
    .where(inArray(assignmentsTable.id, assignmentIds));

  const taskIds = [...new Set(assignments.map((assignment) => assignment.taskId))];

  const tasks = await db.select({
    id: tasksTable.id,
    taskType: tasksTable.taskType,
  }).from(tasksTable)
    .where(inArray(tasksTable.id, taskIds.length > 0 ? taskIds : [0]));

  const taskMap = new Map(tasks.map(t => [t.id, t.taskType]));
  const assignmentMap = new Map(assignments.map(a => [a.id, a.taskId]));

  const byType: Record<string, { auto: number; total: number }> = {};
  for (const v of verifications) {
    const taskId = assignmentMap.get(v.assignmentId) ?? 0;
    const taskType = taskMap.get(taskId) ?? "unknown";
    if (!byType[taskType]) byType[taskType] = { auto: 0, total: 0 };
    byType[taskType].total++;
    if (v.method === "automatic") byType[taskType].auto++;
  }

  const byTaskType = Object.entries(byType).map(([taskType, stats]) => ({
    taskType,
    automationRate: stats.total > 0 ? Math.round((stats.auto / stats.total) * 100) / 100 : 0,
    count: stats.total,
  }));

  res.json(GetAutomationStatsResponse.parse({
    overallRate: Math.round(overallRate * 100) / 100,
    autoApproved,
    autoRejected,
    manualReview,
    totalProcessed: total,
    avgProcessingMs: 0,
    byTaskType,
  }));
});

router.get("/dashboard/task-type-breakdown", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const taskIds = await getVisibleTaskIds(currentUser);
  if (taskIds.length === 0) {
    res.json(GetTaskTypeBreakdownResponse.parse([]));
    return;
  }

  const tasks = await db.select({
    taskType: tasksTable.taskType,
    platform: tasksTable.platform,
    reward: tasksTable.reward,
  }).from(tasksTable)
    .where(inArray(tasksTable.id, taskIds));

  const breakdown: Record<string, { count: number; totalReward: number }> = {};
  for (const t of tasks) {
    const key = `${t.taskType}|${t.platform}`;
    if (!breakdown[key]) breakdown[key] = { count: 0, totalReward: 0 };
    breakdown[key].count++;
    breakdown[key].totalReward += t.reward;
  }

  const items = Object.entries(breakdown).map(([key, stats]) => {
    const [taskType, platform] = key.split("|");
    return { taskType, platform, count: stats.count, totalReward: stats.totalReward };
  });

  res.json(GetTaskTypeBreakdownResponse.parse(items));
});

export default router;
