import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db, usersTable, assignmentsTable, verificationsTable } from "@workspace/db";
import {
  ListUsersQueryParams,
  ListUsersResponse,
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  GetUserReputationParams,
  GetUserReputationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatUser(u: any) {
  return {
    ...u,
    avatarUrl: u.avatarUrl ?? null,
    country: u.country ?? null,
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { role, page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (role) conditions.push(eq(usersTable.role, role as any));

  const [users, countResult] = await Promise.all([
    db.select().from(usersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(usersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  res.json(ListUsersResponse.parse({
    items: users.map(formatUser),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  }));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserResponse.parse(formatUser(user)));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: any = {};
  if (parsed.data.name) updateData.name = parsed.data.name;
  if (parsed.data.country !== undefined) updateData.country = parsed.data.country;
  if (parsed.data.language) updateData.language = parsed.data.language;
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  const [user] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(UpdateUserResponse.parse(formatUser(user)));
});

router.get("/users/:id/reputation", async (req, res): Promise<void> => {
  const params = GetUserReputationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = params.data.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const assignments = await db.select({
    id: assignmentsTable.id,
    status: assignmentsTable.status,
    taskId: assignmentsTable.taskId,
  }).from(assignmentsTable).where(eq(assignmentsTable.workerId, userId));

  const totalCompleted = assignments.filter(a => a.status === "approved").length;
  const totalRejected = assignments.filter(a => a.status === "rejected").length;
  const totalSubmitted = assignments.length;
  const validationRate = totalSubmitted > 0 ? totalCompleted / totalSubmitted : 0;

  const verifications = await db.select({
    confidenceScore: verificationsTable.confidenceScore,
  }).from(verificationsTable)
    .where(sql`${verificationsTable.assignmentId} = ANY(${assignments.map(a => a.id).concat([0])})`);

  const avgProofQuality = verifications.length > 0
    ? verifications.reduce((s, v) => s + v.confidenceScore, 0) / verifications.length
    : 0;

  // Compute reputation level based on score
  const score = user.reputationScore;
  let level: string;
  if (score >= 90) level = "platinum";
  else if (score >= 70) level = "gold";
  else if (score >= 50) level = "silver";
  else if (score >= 20) level = "bronze";
  else level = "newcomer";

  res.json(GetUserReputationResponse.parse({
    userId,
    score: user.reputationScore,
    tasksCompleted: totalCompleted,
    validationRate: Math.round(validationRate * 100) / 100,
    avgProofQuality: Math.round(avgProofQuality * 100) / 100,
    level,
    badges: totalCompleted >= 10 ? ["verified_worker"] : [],
    topCategories: [],
  }));
});

export default router;
