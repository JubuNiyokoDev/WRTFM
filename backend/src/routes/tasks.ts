import { Router, type IRouter } from "express";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db, tasksTable, campaignsTable, assignmentsTable, usersTable } from "@/db";
import {
  ListTasksQueryParams,
  ListTasksResponse,
  CreateTaskBody,
  CreateTaskResponse,
  ListAvailableTasksQueryParams,
  ListAvailableTasksResponse,
  GetTaskParams,
  GetTaskResponse,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
} from "@/api-zod";
import { getUserIdFromToken } from "./auth";
import { requireAuth, requireRole } from "@/middlewares/auth";

const router: IRouter = Router();

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

async function getCurrentUser(req: any) {
  const userId = (req as any).userId ?? getRequestUserId(req);
  if (!userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

async function enrichTask(task: any) {
  const [campaign] = await db.select().from(campaignsTable)
    .where(eq(campaignsTable.id, task.campaignId));

  return {
    ...task,
    targetUrl: task.targetUrl ?? null,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    proofRequirements: task.proofRequirements ?? [],
    campaign: campaign ? {
      ...campaign,
      targetUrl: campaign.targetUrl ?? undefined,
      deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
      targetCountries: campaign.targetCountries ?? [],
      targetLanguages: campaign.targetLanguages ?? [],
      proofRequirements: campaign.proofRequirements ?? [],
    } : undefined,
  };
}

async function canAccessTask(user: any, task: any): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin") return true;

  const [campaign] = await db.select().from(campaignsTable)
    .where(eq(campaignsTable.id, task.campaignId));
  if (!campaign) return false;

  if (user.role === "client") {
    return campaign.clientId === user.id;
  }

  if (user.role === "worker") {
    if (task.status === "available" && campaign.status === "active") return true;
    const [assignment] = await db.select({ id: assignmentsTable.id }).from(assignmentsTable)
      .where(and(eq(assignmentsTable.taskId, task.id), eq(assignmentsTable.workerId, user.id)))
      .limit(1);
    return Boolean(assignment);
  }

  return false;
}

router.get("/tasks/available", requireAuth, requireRole("worker", "admin"), async (req, res): Promise<void> => {
  const params = ListAvailableTasksQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { type, platform, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  let conditions: any[] = [eq(tasksTable.status, "available")];
  if (type) conditions.push(eq(tasksTable.taskType, type as any));
  if (platform) conditions.push(eq(tasksTable.platform, platform));

  const [tasks, countResult] = await Promise.all([
    db.select().from(tasksTable)
      .where(and(...conditions))
      .orderBy(desc(tasksTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(tasksTable).where(and(...conditions)),
  ]);

  const activeTasks = [];
  for (const task of tasks) {
    const enrichedTask = await enrichTask(task);
    if (enrichedTask.campaign?.status === "active") activeTasks.push(enrichedTask);
  }

  res.json(ListAvailableTasksResponse.parse({
    items: activeTasks,
    total: activeTasks.length,
    page,
    limit,
  }));
});

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role === "worker") {
    res.status(403).json({ error: "Workers must use available tasks or assignments endpoints" });
    return;
  }

  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { campaignId, type, status, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (campaignId) conditions.push(eq(tasksTable.campaignId, campaignId));
  if (type) conditions.push(eq(tasksTable.taskType, type as any));
  if (status) conditions.push(eq(tasksTable.status, status as any));

  if (currentUser.role === "client") {
    const clientCampaigns = await db.select({ id: campaignsTable.id }).from(campaignsTable)
      .where(eq(campaignsTable.clientId, currentUser.id));
    const campaignIds = clientCampaigns.map((campaign) => campaign.id);
    if (campaignIds.length === 0) {
      res.json(ListTasksResponse.parse({ items: [], total: 0, page, limit }));
      return;
    }
    conditions.push(inArray(tasksTable.campaignId, campaignIds));
  }

  const [tasks, countResult] = await Promise.all([
    db.select().from(tasksTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasksTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(tasksTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const enriched = await Promise.all(tasks.map(enrichTask));

  res.json(ListTasksResponse.parse({
    items: enriched,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  }));
});

router.post("/tasks", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [task] = await db.insert(tasksTable).values({
    campaignId: data.campaignId,
    title: data.title,
    taskType: data.taskType as any,
    platform: data.platform,
    targetUrl: data.targetUrl ?? null,
    reward: data.reward,
    status: "available",
    instructions: data.instructions,
    proofRequirements: data.proofRequirements ?? [],
    estimatedMinutes: data.estimatedMinutes ?? 5,
    deadline: data.deadline ? new Date(data.deadline) : null,
  }).returning();

  res.status(201).json(CreateTaskResponse.parse(await enrichTask(task)));
});

router.get("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!(await canAccessTask(currentUser, task))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetTaskResponse.parse(await enrichTask(task)));
});

router.patch("/tasks/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: any = {};
  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.instructions) updateData.instructions = parsed.data.instructions;
  if (parsed.data.status) updateData.status = parsed.data.status;

  const [task] = await db.update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(UpdateTaskResponse.parse(await enrichTask(task)));
});

export default router;
