import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql, inArray, or } from "drizzle-orm";
import {
  db,
  usersTable,
  assignmentsTable,
  verificationsTable,
  kycVerificationsTable,
} from "@/db";
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
import {
  buildKycPublicSummary,
  sanitizeKycResult,
} from "@/lib/kyc-response-sanitizer";
import {
  fetchProofFile,
  getFileHash,
  isAppwriteStorageConfigured,
  uploadBufferFile,
} from "@/lib/appwrite-storage";
import { BurundiKycEngine } from "@/lib/kyc-burundi/engine";
import { extractLiveFaceEmbedding } from "@/lib/kyc-burundi/face-matcher";
import { livenessDetector } from "@/lib/kyc-burundi/liveness-detector";
import type { ActiveLivenessChallenge } from "@/lib/kyc-burundi/liveness-detector";
import {
  LIVENESS_CHALLENGES,
  confirmLivenessSegment,
  createLivenessSession,
  deleteLivenessSession,
  getLivenessSession,
  selectLiveReferenceFrame,
  validateLivenessSegments,
} from "@/lib/kyc-burundi/liveness-session-store";

const router: IRouter = Router();
const burundiKycEngine = new BurundiKycEngine();
const KYC_VISION_SERVICE_URL =
  process.env.KYC_VISION_SERVICE_URL ?? "http://127.0.0.1:5010";

function dataUriToBuffer(uri: string): Buffer {
  return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
}

function normalizeDataUri(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("data:image")
    ? value
    : null;
}

function parseChallengeFrames(value: unknown): Buffer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((frame): frame is string => typeof frame === "string" && frame.startsWith("data:image"))
    .map(dataUriToBuffer);
}

function parseJsonLivenessSegments(body: any) {
  const raw = body?.livenessSegments ?? body?.segments ?? {};
  return {
    blink: parseChallengeFrames(raw.blink),
    head_turn: parseChallengeFrames(raw.head_turn),
    mouth: parseChallengeFrames(raw.mouth),
  } satisfies Record<ActiveLivenessChallenge, Buffer[]>;
}

async function validateBurundiDocumentCandidate(
  imageBuffer: Buffer,
  side: "front" | "back",
) {
  const formData = new FormData();
  formData.append("side", side);
  formData.append(
    "image",
    new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }),
    `${side}-candidate.jpg`,
  );

  const response = await fetch(
    `${KYC_VISION_SERVICE_URL}/document-candidate-burundi`,
    {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `KYC Vision Service /document-candidate-burundi ${response.status}: ${text}`,
    );
  }

  return (await response.json()) as {
    isValid: boolean;
    reason: string;
    anchorsFound: string[];
    confidence: number;
    qualityOk: boolean;
    elapsed_ms: number;
    textPreview?: string;
  };
}

async function uploadKycDocuments(files: {
  front: Buffer;
  back: Buffer;
  liveFace: Buffer;
  livenessSegments?: Record<ActiveLivenessChallenge, Buffer[]>;
}) {
  if (!isAppwriteStorageConfigured()) {
    throw new Error(
      "Appwrite storage is required for production KYC documents.",
    );
  }

  const [front, back, liveFace] = await Promise.all([
    uploadBufferFile({
      buffer: files.front,
      mimetype: "image/jpeg",
      originalname: "kyc-front-document.jpg",
    }),
    uploadBufferFile({
      buffer: files.back,
      mimetype: "image/jpeg",
      originalname: "kyc-back-document.jpg",
    }),
    uploadBufferFile({
      buffer: files.liveFace,
      mimetype: "image/jpeg",
      originalname: "kyc-live-face-frame.jpg",
    }),
  ]);

  const livenessSegments: Partial<Record<ActiveLivenessChallenge, Awaited<ReturnType<typeof uploadBufferFile>>[]>> = {};
  if (files.livenessSegments) {
    for (const challenge of LIVENESS_CHALLENGES) {
      livenessSegments[challenge] = await Promise.all(
        files.livenessSegments[challenge].map((frame, index) =>
          uploadBufferFile({
            buffer: frame,
            mimetype: "image/jpeg",
            originalname: `kyc-liveness-${challenge}-${index + 1}.jpg`,
          }),
        ),
      );
    }
  }

  return { front, back, liveFace, livenessSegments };
}

async function findKycDuplicate(params: {
  userId: number;
  officialNumber?: string;
  frontHash: string;
  backHash: string;
  liveFaceHash: string;
  liveFaceEmbedding?: number[];
}) {
  const conditions = [
    eq(kycVerificationsTable.frontDocumentHash, params.frontHash),
    eq(kycVerificationsTable.backDocumentHash, params.backHash),
    eq(kycVerificationsTable.liveFaceFrameHash, params.liveFaceHash),
  ];
  if (params.officialNumber) {
    conditions.push(eq(kycVerificationsTable.officialNumber, params.officialNumber));
  }

  const directMatches = await db
    .select({
      id: kycVerificationsTable.id,
      userId: kycVerificationsTable.userId,
      status: kycVerificationsTable.status,
      officialNumber: kycVerificationsTable.officialNumber,
      frontDocumentHash: kycVerificationsTable.frontDocumentHash,
      backDocumentHash: kycVerificationsTable.backDocumentHash,
      liveFaceFrameHash: kycVerificationsTable.liveFaceFrameHash,
    })
    .from(kycVerificationsTable)
    .where(or(...conditions));

  const directMatch = directMatches.find((match) => match.userId !== params.userId);
  if (directMatch) return { ...directMatch, matchType: "document_or_number_or_live_frame" };

  if (!params.liveFaceEmbedding?.length) return null;

  const biometricCandidates = await db
    .select({
      id: kycVerificationsTable.id,
      userId: kycVerificationsTable.userId,
      status: kycVerificationsTable.status,
      liveFaceEmbedding: kycVerificationsTable.liveFaceEmbedding,
    })
    .from(kycVerificationsTable);

  for (const candidate of biometricCandidates) {
    if (candidate.userId === params.userId) continue;
    const stored = Array.isArray(candidate.liveFaceEmbedding)
      ? candidate.liveFaceEmbedding.filter((value): value is number => typeof value === "number")
      : [];
    const similarity = cosineSimilarity(params.liveFaceEmbedding, stored);
    if (similarity >= 0.82) {
      return {
        id: candidate.id,
        userId: candidate.userId,
        status: candidate.status,
        matchType: "biometric_live_face",
        biometricSimilarity: Math.round(similarity * 10_000) / 10_000,
      };
    }
  }

  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function formatUser(u: typeof usersTable.$inferSelect) {
  let kycSummary = null;
  if (u.kycData) {
    try {
      kycSummary = buildKycPublicSummary(u.kycData);
    } catch (err) {
      console.error("[formatUser] Failed to summarize kycData:", err);
      kycSummary = null;
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
    kycData: kycSummary,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function formatKycVerification(
  verification: typeof kycVerificationsTable.$inferSelect,
  options: { includeEncryptedResult?: boolean } = {},
) {
  let result: unknown = undefined;
  if (options.includeEncryptedResult) {
    try {
      result = decryptKycData(verification.encryptedResult);
    } catch {
      result = { error: "KYC result could not be decrypted." };
    }
  }

  return {
    id: verification.id,
    userId: verification.userId,
    status: verification.status,
    confidence: verification.confidence,
    reason: verification.reason,
    documentType: verification.documentType,
    method: verification.method,
    officialNumber: verification.officialNumber,
    duplicateSignals: {
      officialNumberPresent: Boolean(verification.officialNumber),
      frontDocumentHash: verification.frontDocumentHash.slice(0, 12),
      backDocumentHash: verification.backDocumentHash.slice(0, 12),
      liveFaceFrameHash: verification.liveFaceFrameHash.slice(0, 12),
      hasLiveFaceEmbedding: Array.isArray(verification.liveFaceEmbedding),
    },
    storageFiles: verification.storageFiles
      ? sanitizeKycResult({ storageFiles: verification.storageFiles })?.storageFiles
      : null,
    fileAccess: buildKycFileAccess(verification.id, verification.storageFiles),
    reviewedBy: verification.reviewedBy,
    reviewReason: verification.reviewReason,
    createdAt: verification.createdAt,
    reviewedAt: verification.reviewedAt,
    result: options.includeEncryptedResult ? sanitizeKycResult(result) : undefined,
  };
}

function buildKycFileAccess(verificationId: number, storageFiles: unknown) {
  if (!storageFiles || typeof storageFiles !== "object") return null;
  const files = storageFiles as Record<string, any>;
  const direct = ["front", "back", "liveFace"].flatMap((kind) => {
    const file = files[kind];
    if (!file?.fileId) return [];
    return [{
      kind,
      label:
        kind === "front"
          ? "Recto carte"
          : kind === "back"
            ? "Verso carte"
            : "Frame live référence",
      mimeType: file.mimeType ?? "image/jpeg",
      size: file.size ?? null,
      url: `/api/admin/kyc-verifications/${verificationId}/files/${kind}`,
    }];
  });

  const livenessSegments = LIVENESS_CHALLENGES.map((challenge) => {
    const frames = Array.isArray(files.livenessSegments?.[challenge])
      ? files.livenessSegments[challenge]
      : [];
    return {
      challenge,
      frames: frames
        .map((file: any, index: number) =>
          file?.fileId
            ? {
                index,
                label: `${challenge} ${index + 1}`,
                mimeType: file.mimeType ?? "image/jpeg",
                size: file.size ?? null,
                url: `/api/admin/kyc-verifications/${verificationId}/files/${challenge}?index=${index}`,
              }
            : null,
        )
        .filter(Boolean),
    };
  });

  return { direct, livenessSegments };
}

function summarizeLivenessSegments(segments: Record<ActiveLivenessChallenge, Buffer[]>) {
  return Object.fromEntries(
    LIVENESS_CHALLENGES.map((challenge) => [
      challenge,
      {
        frameCount: segments[challenge].length,
        byteSizes: segments[challenge].map((frame) => frame.length),
      },
    ]),
  );
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

  const assignmentIds = assignments.map((a) => a.id);
  const verifications =
    assignmentIds.length > 0
      ? await db
          .select({
            confidenceScore: verificationsTable.confidenceScore,
          })
          .from(verificationsTable)
          .where(inArray(verificationsTable.assignmentId, assignmentIds))
      : [];

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

router.get("/users/me/kyc/history", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const history = await db
    .select()
    .from(kycVerificationsTable)
    .where(eq(kycVerificationsTable.userId, currentUser.id))
    .orderBy(desc(kycVerificationsTable.createdAt))
    .limit(20);

  res.json({
    items: history.map((item) => formatKycVerification(item)),
  });
});

router.get("/admin/kyc-verifications", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const status =
    typeof req.query.status === "string" &&
    ["approved", "rejected", "manual_review"].includes(req.query.status)
      ? (req.query.status as "approved" | "rejected" | "manual_review")
      : undefined;
  const userId =
    typeof req.query.userId === "string" && /^\d+$/.test(req.query.userId)
      ? Number(req.query.userId)
      : undefined;
  const page =
    typeof req.query.page === "string" && /^\d+$/.test(req.query.page)
      ? Math.max(Number(req.query.page), 1)
      : 1;
  const limit =
    typeof req.query.limit === "string" && /^\d+$/.test(req.query.limit)
      ? Math.min(Math.max(Number(req.query.limit), 1), 100)
      : 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(kycVerificationsTable.status, status));
  if (userId) conditions.push(eq(kycVerificationsTable.userId, userId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(kycVerificationsTable)
      .where(where)
      .orderBy(desc(kycVerificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(kycVerificationsTable)
      .where(where),
  ]);

  res.json({
    items: items.map((item) => formatKycVerification(item)),
    total: totalRows[0]?.count ?? 0,
    page,
    limit,
  });
});

router.get("/admin/kyc-verifications/:id", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid KYC verification id." });
    return;
  }

  const [verification] = await db
    .select()
    .from(kycVerificationsTable)
    .where(eq(kycVerificationsTable.id, id));
  if (!verification) {
    res.status(404).json({ error: "KYC verification not found." });
    return;
  }

  res.json(formatKycVerification(verification, { includeEncryptedResult: true }));
});

router.get("/admin/kyc-verifications/:id/files/:kind", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const id = Number(req.params.id);
  const kind = req.params.kind as string;
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid KYC verification id." });
    return;
  }

  const [verification] = await db
    .select({ storageFiles: kycVerificationsTable.storageFiles })
    .from(kycVerificationsTable)
    .where(eq(kycVerificationsTable.id, id));
  if (!verification?.storageFiles || typeof verification.storageFiles !== "object") {
    res.status(404).json({ error: "KYC files not found." });
    return;
  }

  const storageFiles = verification.storageFiles as Record<string, any>;
  let file = storageFiles[kind];
  if (LIVENESS_CHALLENGES.includes(kind as ActiveLivenessChallenge)) {
    const index =
      typeof req.query.index === "string" && /^\d+$/.test(req.query.index)
        ? Number(req.query.index)
        : 0;
    file = storageFiles.livenessSegments?.[kind]?.[index];
  }

  if (!file?.fileId) {
    res.status(404).json({ error: "KYC file not found." });
    return;
  }

  try {
    const stored = await fetchProofFile(file.fileId);
    res.setHeader("content-type", stored.contentType ?? file.mimeType ?? "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.send(Buffer.from(stored.body));
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Unable to fetch KYC file.",
    });
  }
});

router.post("/admin/kyc-verifications/:id/decision", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const id = Number(req.params.id);
  const decision = req.body?.decision;
  const reviewReason =
    typeof req.body?.reviewReason === "string" && req.body.reviewReason.trim()
      ? req.body.reviewReason.trim()
      : "Compliance decision";
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid KYC verification id." });
    return;
  }
  if (decision !== "approved" && decision !== "rejected") {
    res.status(400).json({ error: "decision must be approved or rejected." });
    return;
  }

  const [verification] = await db
    .select()
    .from(kycVerificationsTable)
    .where(eq(kycVerificationsTable.id, id));
  if (!verification) {
    res.status(404).json({ error: "KYC verification not found." });
    return;
  }

  const reviewedAt = new Date();
  const resultPayload = {
    decision,
    source: "admin_compliance_review",
    reviewReason,
    reviewedBy: currentUser.id,
    reviewedAt: reviewedAt.toISOString(),
    originalVerificationId: verification.id,
  };

  const [updatedVerification] = await db
    .update(kycVerificationsTable)
    .set({
      status: decision,
      reviewedBy: currentUser.id,
      reviewReason,
      reviewedAt,
    })
    .where(eq(kycVerificationsTable.id, id))
    .returning();

  const [updatedUser] = await db
    .update(usersTable)
    .set({
      kycStatus: decision === "approved" ? "verified" : "rejected",
      kycData: encryptKycData(resultPayload),
    })
    .where(eq(usersTable.id, verification.userId))
    .returning();

  res.json({
    verification: formatKycVerification(updatedVerification!),
    user: updatedUser ? formatUser(updatedUser) : null,
  });
});

router.post("/admin/users/:id/kyc/reset", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const userId = Number(req.params.id);
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "KYC reset by compliance";
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }

  const resetPayload = {
    decision: "reset",
    source: "admin_compliance_review",
    reason,
    reviewedBy: currentUser.id,
    resetAt: new Date().toISOString(),
  };
  const [updatedUser] = await db
    .update(usersTable)
    .set({
      kycStatus: "unverified",
      kycData: encryptKycData(resetPayload),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updatedUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  res.json({
    message: "KYC reset successfully.",
    user: formatUser(updatedUser),
  });
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

router.get("/users/me/kyc/liveness-session", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (currentUser.kycStatus === "verified") {
    res.json({
      alreadyVerified: true,
      kycStatus: currentUser.kycStatus,
      message: "KYC déjà vérifié de façon permanente.",
    });
    return;
  }

  res.json(createLivenessSession(currentUser.id));
});

router.post("/users/me/kyc/liveness-segment", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sessionId =
    typeof req.body?.livenessSessionId === "string"
      ? req.body.livenessSessionId
      : "";
  const expectedChallenge =
    typeof req.body?.expectedChallenge === "string"
      ? (req.body.expectedChallenge as ActiveLivenessChallenge)
      : undefined;
  const frames = parseChallengeFrames(req.body?.frames);
  const session = getLivenessSession(sessionId, currentUser.id);

  if (!session) {
    res.status(400).json({ error: "Session liveness expirée ou inconnue." });
    return;
  }
  if (!expectedChallenge || !LIVENESS_CHALLENGES.includes(expectedChallenge)) {
    res.status(400).json({ error: "Défi liveness inconnu." });
    return;
  }
  const requiredChallenge = session.order[session.nextIndex];
  if (expectedChallenge !== requiredChallenge) {
    res.status(409).json({
      error: "Défi hors ordre.",
      expectedChallenge: requiredChallenge,
      receivedChallenge: expectedChallenge,
    });
    return;
  }
  if (frames.length < 5 || frames.length > 8) {
    res.status(400).json({
      error: `Segment ${expectedChallenge}: 5 à 8 frames requises (reçu: ${frames.length}).`,
    });
    return;
  }

  try {
    const result = await livenessDetector.checkActiveLivenessSegment(
      expectedChallenge,
      frames,
    );
    if (result.passed) {
      const updated = confirmLivenessSegment(sessionId, expectedChallenge, frames);
      res.json({
        ...result,
        confirmed: Array.from(updated?.confirmed ?? []),
        nextChallenge: updated?.order[updated.nextIndex] ?? null,
      });
      return;
    }

    res.status(422).json({
      ...result,
      error: result.reason || "Geste non confirmé par le serveur.",
      confirmed: Array.from(session.confirmed),
      nextChallenge: session.order[session.nextIndex] ?? null,
    });
  } catch (error) {
    res.status(422).json({
      error:
        error instanceof Error
          ? error.message
          : "Échec vérification segment liveness",
    });
  }
});

router.post("/users/me/kyc/document-candidate", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const side = req.body?.side === "back" ? "back" : "front";
  const imageData = normalizeDataUri(req.body?.imageData);
  if (!imageData) {
    res.status(400).json({ error: "Image candidate requise." });
    return;
  }

  try {
    const result = await validateBurundiDocumentCandidate(
      dataUriToBuffer(imageData),
      side,
    );
    res.status(result.isValid ? 200 : 422).json(result);
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : "Validation document indisponible.",
    });
  }
});

router.post("/users/me/kyc", async (req, res): Promise<void> => {
  const currentUser = await getAuthenticatedUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (currentUser.kycStatus === "verified") {
    res.json({
      message: "KYC déjà vérifié de façon permanente.",
      user: formatUser(currentUser),
    });
    return;
  }

  const frontImageData =
    normalizeDataUri(req.body?.frontImageData) ??
    normalizeDataUri(req.body?.frontImage) ??
    normalizeDataUri(req.body?.idCardData);
  const backImageData =
    normalizeDataUri(req.body?.backImageData) ??
    normalizeDataUri(req.body?.backImage);

  if (!frontImageData || !backImageData) {
    res.status(400).json({
      error: "Recto et verso de la carte sont requis en base64 data URI.",
    });
    return;
  }

  const livenessSessionId =
    typeof req.body?.livenessSessionId === "string"
      ? req.body.livenessSessionId
      : "";
  const livenessOrder = Array.isArray(req.body?.livenessOrder)
    ? (req.body.livenessOrder as ActiveLivenessChallenge[])
    : null;
  const livenessSegments = parseJsonLivenessSegments(req.body);
  const session = getLivenessSession(livenessSessionId, currentUser.id);

  if (!session) {
    res.status(400).json({ error: "Session liveness expirée ou inconnue." });
    return;
  }
  if (session.confirmed.size !== LIVENESS_CHALLENGES.length) {
    res.status(400).json({
      error:
        "Tous les défis liveness doivent être confirmés par le serveur avant l'analyse KYC.",
      confirmed: Array.from(session.confirmed),
    });
    return;
  }
  if (
    !livenessOrder ||
    JSON.stringify(livenessOrder) !== JSON.stringify(session.order)
  ) {
    res.status(400).json({ error: "Ordre liveness invalide pour cette session." });
    return;
  }
  const segmentError = validateLivenessSegments(livenessSegments);
  if (segmentError) {
    res.status(400).json({ error: segmentError });
    return;
  }

  const liveFaceFrameBuffer = selectLiveReferenceFrame(livenessSegments);
  if (!liveFaceFrameBuffer) {
    res.status(400).json({ error: "Aucune frame live de référence disponible." });
    return;
  }

  try {
    const frontImageBuffer = dataUriToBuffer(frontImageData);
    const backImageBuffer = dataUriToBuffer(backImageData);
    const frontHash = getFileHash(frontImageBuffer);
    const backHash = getFileHash(backImageBuffer);
    const liveFaceHash = getFileHash(liveFaceFrameBuffer);
    const liveFaceEmbedding = await extractLiveFaceEmbedding(liveFaceFrameBuffer);

    await db
      .update(usersTable)
      .set({ kycStatus: "pending" })
      .where(eq(usersTable.id, currentUser.id));

    const result = await burundiKycEngine.runFullVerification(
      frontImageBuffer,
      backImageBuffer,
      liveFaceFrameBuffer,
      { eyeBlink: true, headTurn: true, mouthMovement: true },
      undefined,
      livenessSegments,
      livenessOrder,
      liveFaceFrameBuffer,
    );
    const officialNumber = result.ocr?.officialFields?.numeroMifpdi;

    const duplicate = await findKycDuplicate({
      userId: currentUser.id,
      officialNumber,
      frontHash,
      backHash,
      liveFaceHash,
      liveFaceEmbedding,
    });

    const storageFiles = await uploadKycDocuments({
      front: frontImageBuffer,
      back: backImageBuffer,
      liveFace: liveFaceFrameBuffer,
      livenessSegments,
    });
    const livenessEvidence = {
      order: livenessOrder,
      segments: summarizeLivenessSegments(livenessSegments),
      source: "server_verified_liveness_segments",
    };

    if (duplicate) {
      const reviewData = {
        decision: "manual_review",
        reason:
          "Doublon KYC détecté: numéro officiel, document ou frame live déjà utilisé par un autre compte.",
        duplicate,
        result,
        storageFiles,
        livenessEvidence,
        liveFaceSource: "server_verified_liveness_frame",
        verifiedAt: null,
      };
      await db.insert(kycVerificationsTable).values({
        userId: currentUser.id,
        status: "manual_review",
        confidence: result.confidence,
        reason: reviewData.reason,
        officialNumber,
        frontDocumentHash: frontHash,
        backDocumentHash: backHash,
        liveFaceFrameHash: liveFaceHash,
        liveFaceEmbedding,
        storageFiles,
        encryptedResult: encryptKycData(reviewData),
      });
      const [updatedUser] = await db
        .update(usersTable)
        .set({
          kycStatus: "pending",
          kycData: encryptKycData(reviewData),
        })
        .where(eq(usersTable.id, currentUser.id))
        .returning();
      deleteLivenessSession(livenessSessionId);
      res.status(409).json({
        error: reviewData.reason,
        decision: "manual_review",
        user: formatUser(updatedUser!),
      });
      return;
    }

    if (!result.approved) {
      const rejectionData = {
        decision: "rejected",
        reason: result.reason,
        result,
        storageFiles,
        livenessEvidence,
        liveFaceSource: "server_verified_liveness_frame",
      };
      await db.insert(kycVerificationsTable).values({
        userId: currentUser.id,
        status: "rejected",
        confidence: result.confidence,
        reason: result.reason,
        officialNumber,
        frontDocumentHash: frontHash,
        backDocumentHash: backHash,
        liveFaceFrameHash: liveFaceHash,
        liveFaceEmbedding,
        storageFiles,
        encryptedResult: encryptKycData(rejectionData),
      });
      await db
        .update(usersTable)
        .set({
          kycStatus: "rejected",
          kycData: encryptKycData(rejectionData),
        })
        .where(eq(usersTable.id, currentUser.id));
      deleteLivenessSession(livenessSessionId);
      res.status(422).json({ error: result.reason, details: result });
      return;
    }

    const kycPayload = {
      decision: "approved",
      method: result.method,
      confidence: result.confidence,
      officialNumber,
      result,
      storageFiles,
      livenessEvidence,
      liveFaceSource: "server_verified_liveness_frame",
      verifiedAt: new Date().toISOString(),
    };

    await db.insert(kycVerificationsTable).values({
      userId: currentUser.id,
      status: "approved",
      confidence: result.confidence,
      reason: result.reason,
      officialNumber,
      frontDocumentHash: frontHash,
      backDocumentHash: backHash,
      liveFaceFrameHash: liveFaceHash,
      liveFaceEmbedding,
      storageFiles,
      encryptedResult: encryptKycData(kycPayload),
    });

    const [updatedUser] = await db
      .update(usersTable)
      .set({ kycStatus: "verified", kycData: encryptKycData(kycPayload) })
      .where(eq(usersTable.id, currentUser.id))
      .returning();
    deleteLivenessSession(livenessSessionId);

    res.json({
      message: "KYC verified successfully.",
      confidence: result.confidence,
      faceMatching: {
        similarity: result.faceMatching?.similarity,
        threshold: result.faceMatching?.threshold,
        isMatch: result.faceMatching?.isMatch,
        source: "server_verified_liveness_frame",
      },
      user: formatUser(updatedUser!),
    });
  } catch (err: any) {
    console.error("[KYC] Engine error:", err);
    const isKycRejection =
      err?.name === "BurundiKycError" ||
      typeof err?.code === "string" ||
      /Aucune ancre|document|OCR|visage|liveness/i.test(err?.message ?? "");
    const reason =
      err instanceof Error
        ? err.message
        : "La vérification KYC a échoué.";

    if (isKycRejection) {
      const rejectionData = {
        decision: "rejected",
        reason,
        code: err?.code ?? "KYC_REJECTED",
        liveFaceSource: "server_verified_liveness_frame",
        rejectedAt: new Date().toISOString(),
      };
      await db
        .update(usersTable)
        .set({
          kycStatus: "rejected",
          kycData: encryptKycData(rejectionData),
        })
        .where(eq(usersTable.id, currentUser.id));
      deleteLivenessSession(livenessSessionId);
      res.status(422).json({
        error: reason,
        details: rejectionData,
      });
      return;
    }

    await db
      .update(usersTable)
      .set({ kycStatus: "unverified" })
      .where(eq(usersTable.id, currentUser.id));
    res.status(500).json({
      error: "KYC processing failed. Please try again.",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
