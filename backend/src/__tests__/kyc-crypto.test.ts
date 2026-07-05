import { describe, it, expect } from "vitest";
import { encryptKycData, decryptKycData } from "../lib/kyc-crypto";

describe("KYC Data Encryption", () => {
  it("should encrypt and decrypt KYC data correctly", () => {
    const testData = {
      method: "ocr_burundi_id_realtime",
      confidence: 95,
      faceMatch: {
        detected: true,
        similarity: 0.78,
        method: "bhattacharyya_multi_histogram_v3",
      },
      document: {
        isLikelyIdCard: true,
        aspectRatio: 1.58,
        hasPortraitZone: true,
        imageWidth: 640,
        imageHeight: 480,
      },
      verifiedAt: "2026-07-05T13:48:35.275Z",
    };

    // Encrypt the data
    const encrypted = encryptKycData(testData);

    // Should be a string
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(50);

    // Should not contain original data in plaintext
    expect(encrypted).not.toContain("ocr_burundi_id_realtime");
    expect(encrypted).not.toContain("bhattacharyya_multi_histogram_v3");

    // Decrypt back to original
    const decrypted = decryptKycData(encrypted);

    // Should match original exactly
    expect(decrypted).toEqual(testData);
  });

  it("should handle rejection data encryption", () => {
    const rejectionData = {
      reason:
        "Le visage sur la carte ne correspond pas au selfie (similarité: 45%)",
      faceMatch: {
        detected: true,
        similarity: 0.45,
        method: "bhattacharyya_multi_histogram_v3",
      },
    };

    const encrypted = encryptKycData(rejectionData);
    const decrypted = decryptKycData(encrypted);

    expect(decrypted).toEqual(rejectionData);
  });

  it("should throw error for invalid encrypted data", () => {
    expect(() => decryptKycData("invalid-data")).toThrow();
    expect(() => decryptKycData("")).toThrow();
    expect(() => decryptKycData("abc123")).toThrow();
  });

  it("should produce different encrypted results for same data", () => {
    const data = { test: "value" };
    const encrypted1 = encryptKycData(data);
    const encrypted2 = encryptKycData(data);

    // Should be different (due to random IV)
    expect(encrypted1).not.toBe(encrypted2);

    // But should decrypt to same result
    expect(decryptKycData(encrypted1)).toEqual(data);
    expect(decryptKycData(encrypted2)).toEqual(data);
  });
});
