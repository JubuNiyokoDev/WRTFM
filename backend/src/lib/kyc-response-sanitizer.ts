import { decryptKycData } from "./kyc-crypto";

export function buildKycPublicSummary(kycData: unknown) {
  if (!kycData) return null;

  const raw =
    typeof kycData === "string" ? decryptKycData(kycData) : kycData;
  if (!raw || typeof raw !== "object") return null;

  return {
    decision: (raw as any).decision ?? null,
    confidence: (raw as any).confidence ?? (raw as any).result?.confidence ?? null,
    verifiedAt: (raw as any).verifiedAt ?? null,
    rejectedAt: (raw as any).rejectedAt ?? null,
    resetAt: (raw as any).resetAt ?? null,
    reason: (raw as any).reason ?? null,
    liveFaceSource: (raw as any).liveFaceSource ?? null,
  };
}

export function sanitizeKycResult(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const copy = JSON.parse(JSON.stringify(value));

  if (copy?.result?.faceMatching) {
    delete copy.result.faceMatching.cardFaceEmbedding;
    delete copy.result.faceMatching.selfieFaceEmbedding;
  }
  if (copy?.faceMatching) {
    delete copy.faceMatching.cardFaceEmbedding;
    delete copy.faceMatching.selfieFaceEmbedding;
  }
  if (copy?.liveFaceEmbedding) copy.liveFaceEmbedding = "[masked]";
  if (copy?.storageFiles) {
    copy.storageFiles = sanitizeStorageFiles(copy.storageFiles);
  }

  return copy;
}

function sanitizeStorageFiles(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeStorageFiles);
  if (!value || typeof value !== "object") return value;

  const file = value as Record<string, any>;
  if (file.fileId || file.id || file.bucketId || file.originalName || file.originalname) {
    return {
      id: file.id ?? file.fileId ?? null,
      bucketId: file.bucketId ?? null,
      name: file.name ?? file.originalName ?? file.originalname ?? null,
      mimeType: file.mimeType ?? null,
      size: file.size ?? null,
    };
  }

  return Object.fromEntries(
    Object.entries(file).map(([key, child]) => [key, sanitizeStorageFiles(child)]),
  );
}
