import { describe, expect, it } from "vitest";
import {
  buildKycPublicSummary,
  sanitizeKycResult,
} from "../lib/kyc-response-sanitizer";
import { encryptKycData } from "../lib/kyc-crypto";

describe("kyc-response-sanitizer", () => {
  it("returns only public KYC summary fields for normal user responses", () => {
    const encrypted = encryptKycData({
      decision: "approved",
      confidence: 86,
      verifiedAt: "2026-07-13T08:00:00.000Z",
      storageFiles: {
        front: { id: "private-front-id", bucketId: "kyc-private" },
      },
      result: {
        ocr: { personalFields: { izina: "PRIVATE" } },
        faceMatching: {
          cardFaceEmbedding: [1, 2, 3],
          selfieFaceEmbedding: [4, 5, 6],
        },
      },
    });

    expect(buildKycPublicSummary(encrypted)).toEqual({
      decision: "approved",
      confidence: 86,
      verifiedAt: "2026-07-13T08:00:00.000Z",
      rejectedAt: null,
      resetAt: null,
      reason: null,
      liveFaceSource: null,
    });
  });

  it("masks biometrics and exposes only private storage metadata for admin detail", () => {
    const sanitized = sanitizeKycResult({
      liveFaceEmbedding: [0.1, 0.2],
      storageFiles: {
        front: {
          id: "file-front",
          bucketId: "private-bucket",
          name: "front.jpg",
          mimeType: "image/jpeg",
          size: 12345,
          url: "https://should-not-leak.example/front.jpg",
        },
        livenessSegments: {
          blink: [
            {
              fileId: "blink-1",
              bucketId: "private-bucket",
              originalName: "blink-1.jpg",
              viewUrl: "https://should-not-leak.example/blink-1.jpg",
            },
          ],
        },
      },
      result: {
        faceMatching: {
          similarity: 0.91,
          cardFaceEmbedding: [1, 2, 3],
          selfieFaceEmbedding: [4, 5, 6],
        },
      },
    }) as any;

    expect(sanitized.liveFaceEmbedding).toBe("[masked]");
    expect(sanitized.storageFiles.front).toEqual({
      id: "file-front",
      bucketId: "private-bucket",
      name: "front.jpg",
      mimeType: "image/jpeg",
      size: 12345,
    });
    expect(sanitized.storageFiles.front.url).toBeUndefined();
    expect(sanitized.storageFiles.livenessSegments.blink[0]).toEqual({
      id: "blink-1",
      bucketId: "private-bucket",
      name: "blink-1.jpg",
      mimeType: null,
      size: null,
    });
    expect(sanitized.storageFiles.livenessSegments.blink[0].viewUrl).toBeUndefined();
    expect(sanitized.result.faceMatching.similarity).toBe(0.91);
    expect(sanitized.result.faceMatching.cardFaceEmbedding).toBeUndefined();
    expect(sanitized.result.faceMatching.selfieFaceEmbedding).toBeUndefined();
  });
});
