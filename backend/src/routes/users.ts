import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db, usersTable, assignmentsTable, verificationsTable } from "@/db";
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
} from "@/api-zod";
import { getUserIdFromToken } from "./auth";
import { encryptKycData, decryptKycData } from "@/lib/kyc-crypto";

const router: IRouter = Router();

function formatUser(u: typeof usersTable.$inferSelect) {
  // Decrypt kycData if it exists and is encrypted (string format)
  let decryptedKycData = null;
  if (u.kycData) {
    try {
      if (typeof u.kycData === "string") {
        decryptedKycData = decryptKycData(u.kycData);
      } else {
        // Already decrypted (from migrations or legacy data)
        decryptedKycData = u.kycData;
      }
    } catch (err) {
      console.error("[formatUser] Failed to decrypt kycData:", err);
      decryptedKycData = null;
    }
  }

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
    country: u.country ?? null,
    language: u.language,
    isActive: u.isActive,
    reputationScore: u.reputationScore,
    kycStatus: u.kycStatus,
    kycData: decryptedKycData,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function getBearerUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

async function getAuthenticatedUser(req: any) {
  const userId = getBearerUserId(req);
  if (!userId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

async function buildReputation(userId: number) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return null;

  const assignments = await db
    .select({
      id: assignmentsTable.id,
      status: assignmentsTable.status,
      taskId: assignmentsTable.taskId,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.workerId, userId));

  const totalCompleted = assignments.filter(
    (a) => a.status === "approved",
  ).length;
  const totalRejected = assignments.filter(
    (a) => a.status === "rejected",
  ).length;
  const totalSubmitted = totalCompleted + totalRejected;
  const validationRate =
    totalSubmitted > 0 ? totalCompleted / totalSubmitted : 0;

  const verifications = await db
    .select({
      confidenceScore: verificationsTable.confidenceScore,
    })
    .from(verificationsTable)
    .where(
      sql`${verificationsTable.assignmentId} = ANY(${assignments.map((a) => a.id).concat([0])})`,
    );

  const avgProofQuality =
    verifications.length > 0
      ? verifications.reduce((s, v) => s + v.confidenceScore, 0) /
        verifications.length
      : 0;

  const score = user.reputationScore;
  let level: string;
  if (score >= 90) level = "platinum";
  else if (score >= 70) level = "gold";
  else if (score >= 50) level = "silver";
  else if (score >= 20) level = "bronze";
  else level = "newcomer";

  return {
    userId,
    score: user.reputationScore,
    tasksCompleted: totalCompleted,
    validationRate: Math.round(validationRate * 100) / 100,
    avgProofQuality: Math.round(avgProofQuality * 100) / 100,
    level,
    badges: totalCompleted >= 10 ? ["verified_worker"] : [],
    topCategories: [],
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

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
    db
      .select()
      .from(usersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(usersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  res.json(
    ListUsersResponse.parse({
      items: users.map(formatUser),
      total: countResult[0]?.count ?? 0,
      page,
      limit,
    }),
  );
});

router.get("/users/me/reputation", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const reputation = await buildReputation(currentUser.id);
  res.json(GetUserReputationResponse.parse(reputation));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (currentUser.role !== "admin" && currentUser.id !== params.data.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserResponse.parse(formatUser(user)));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (currentUser.role !== "admin" && currentUser.id !== params.data.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: any = {};
  if (parsed.data.name) updateData.name = parsed.data.name;
  if (parsed.data.country !== undefined)
    updateData.country = parsed.data.country;
  if (parsed.data.language) updateData.language = parsed.data.language;
  if (parsed.data.avatarUrl !== undefined)
    updateData.avatarUrl = parsed.data.avatarUrl;
  if (currentUser.role === "admin" && parsed.data.isActive !== undefined)
    updateData.isActive = parsed.data.isActive;

  const [user] = await db
    .update(usersTable)
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
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetUserReputationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = params.data.id;

  if (currentUser.role !== "admin" && currentUser.id !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const reputation = await buildReputation(userId);
  if (!reputation) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserReputationResponse.parse(reputation));
});

router.post("/users/me/kyc", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { idCardData, selfieData } = req.body;

  if (!idCardData || !selfieData) {
    res.status(400).json({ error: "ID Card image and Selfie are required." });
    return;
  }

  // Validate that both are base64 data URIs
  if (
    !idCardData.startsWith("data:image") ||
    !selfieData.startsWith("data:image")
  ) {
    res.status(400).json({ error: "Images must be valid base64 data URIs." });
    return;
  }

  try {
    // Mark as pending while processing
    await db
      .update(usersTable)
      .set({ kycStatus: "pending" })
      .where(eq(usersTable.id, currentUser.id));

    // Dynamically import the engine to avoid loading heavy models at startup
    const { runKycVerification } = await import("../lib/kyc-engine.js");

    const result = await runKycVerification(
      idCardData,
      selfieData,
      currentUser.name,
    );

    if (!result.approved) {
      // Mark as rejected — encrypt kycData before storing
      const rejectionData = {
        reason: result.reason,
        faceMatch: result.faceMatch,
      };
      await db
        .update(usersTable)
        .set({
          kycStatus: "rejected",
          kycData: encryptKycData(rejectionData),
        })
        .where(eq(usersTable.id, currentUser.id));

      res.status(422).json({ error: result.reason, details: result });
      return;
    }

    // ✅ Approved — save full extracted data (encrypted)
    const kycPayload = {
      method: "ocr_burundi_id_realtime",
      confidence: result.confidence,
      faceMatch: result.faceMatch,
      document: result.document,
      verifiedAt: new Date().toISOString(),
    };

    const [updatedUser] = await db
      .update(usersTable)
      .set({ kycStatus: "verified", kycData: encryptKycData(kycPayload) })
      .where(eq(usersTable.id, currentUser.id))
      .returning();

    res.json({
      message: "KYC verified successfully.",
      confidence: result.confidence,
      faceMatch: result.faceMatch,
      user: formatUser(updatedUser!),
    });
  } catch (err: any) {
    console.error("[KYC] Engine error:", err);
    // Reset to unverified on unexpected error
    await db
      .update(usersTable)
      .set({ kycStatus: "unverified" })
      .where(eq(usersTable.id, currentUser.id));
    res.status(500).json({ error: "KYC processing failed. Please try again." });
  }
});

export default router;
