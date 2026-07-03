import { Router, type IRouter } from "express";
import { eq, and, desc, count, gte, sql } from "drizzle-orm";
import { db, tasksTable, campaignsTable, assignmentsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { getUserIdFromToken } from "./auth";

const router: IRouter = Router();

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
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
      targetUrl: campaign.targetUrl ?? null,
      deadline: campaign.deadline ? campaign.deadline.toISOString() : null,
      targetCountries: campaign.targetCountries ?? [],
      targetLanguages: campaign.targetLanguages ?? [],
      proofRequirements: campaign.proofRequirements ?? [],
    } : undefined,
  };
}

router.get("/tasks/available", async (req, res): Promise<void> => {
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

  const enriched = await Promise.all(tasks.map(enrichTask));

  res.json(ListAvailableTasksResponse.parse({
    items: enriched,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  }));
});

router.get("/tasks", async (req, res): Promise<void> => {
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

router.post("/tasks", async (req, res): Promise<void> => {
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

router.get("/tasks/:id", async (req, res): Promise<void> => {
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

  res.json(GetTaskResponse.parse(await enrichTask(task)));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
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
