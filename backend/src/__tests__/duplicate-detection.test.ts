import { describe, it, expect } from "vitest";
import { runVerificationEngine } from "../lib/verification-engine";
import { generateProofHash } from "../lib/proof-hash";

describe("Proof Duplicate Detection", () => {
  const baseProof = {
    proofType: "screenshot",
    screenshotUrl: "https://example.com/proof1.jpg",
    link: "https://instagram.com/post/12345",
    username: "@testuser",
    description: "Completed the instagram follow task as requested",
    contentHash: "",
  };

  it("should detect duplicate proofs and trigger CRITICAL_DUPLICATE_PROOF", () => {
    // Generate hash for the proof content
    const hash = generateProofHash(baseProof);
    const proofWithHash = { ...baseProof, contentHash: hash };

    // Simulate duplicate detection result (2 duplicates found: 1 by worker, 1 globally)
    const duplicateCheck = {
      hasDuplicate: true,
      duplicateCount: 2,
      byWorker: 1,
      global: 1,
    };

    const result = runVerificationEngine(
      "instagram_follow",
      ["screenshot", "username"],
      proofWithHash,
      {
        reputationScore: 0.8,
        totalCompleted: 10,
        totalRejected: 2,
        workerId: 1,
      },
      { totalCampaigns: 5, totalDisputes: 0, avgAutoRate: 0.9 },
      duplicateCheck,
    );

    // Check that duplicate detection ran
    const duplicateCheckResult = result.checks.find(
      (c) => c.name === "Duplicate Detection",
    );
    expect(duplicateCheckResult).toBeDefined();
    expect(duplicateCheckResult?.passed).toBe(false);
    expect(duplicateCheckResult?.reasonCode).toBe("CRITICAL_DUPLICATE_PROOF");
    expect(duplicateCheckResult?.score).toBe(0.0);
    expect(duplicateCheckResult?.details).toContain("Duplicate proof detected");
    expect(duplicateCheckResult?.details).toContain("2 total");

    // Critical check should force manual_review
    expect(result.status).toBe("manual_review");
    expect(result.reasonCode).toBe("CRITICAL_CHECK_FAILED");
  });

  it("should pass unique proofs without triggering duplicate check", () => {
    // Generate hash for unique proof
    const uniqueProof = {
      ...baseProof,
      screenshotUrl: "https://example.com/unique-proof-abc123.jpg",
      link: "https://instagram.com/post/67890",
      username: "@uniqueuser",
    };
    const hash = generateProofHash(uniqueProof);
    const proofWithHash = { ...uniqueProof, contentHash: hash };

    // Simulate no duplicates found
    const duplicateCheck = {
      hasDuplicate: false,
      duplicateCount: 0,
      byWorker: 0,
      global: 0,
    };

    const result = runVerificationEngine(
      "instagram_follow",
      ["screenshot", "username"],
      proofWithHash,
      {
        reputationScore: 0.8,
        totalCompleted: 10,
        totalRejected: 2,
        workerId: 1,
      },
      { totalCampaigns: 5, totalDisputes: 0, avgAutoRate: 0.9 },
      duplicateCheck,
    );

    // Check that duplicate detection passed
    const duplicateCheckResult = result.checks.find(
      (c) => c.name === "Duplicate Detection",
    );
    expect(duplicateCheckResult).toBeDefined();
    expect(duplicateCheckResult?.passed).toBe(true);
    expect(duplicateCheckResult?.reasonCode).toBe("UNIQUE_PROOF");
    expect(duplicateCheckResult?.score).toBe(1.0);
    expect(duplicateCheckResult?.details).toBe("Proof content is unique");

    // Should not be blocked by duplicate check
    expect(result.status).not.toBe("manual_review");
    expect(result.reasonCode).not.toBe("CRITICAL_CHECK_FAILED");
  });

  it("should generate identical hashes for identical proof content", () => {
    const proof1 = {
      screenshotUrl: "https://example.com/proof.jpg",
      link: "https://instagram.com/post/123",
      username: "@testuser",
      code: null,
      description: "Task completed successfully",
    };

    const proof2 = {
      screenshotUrl: "https://example.com/proof.jpg",
      link: "https://instagram.com/post/123",
      username: "@testuser",
      code: null,
      description: "Task completed successfully",
    };

    const hash1 = generateProofHash(proof1);
    const hash2 = generateProofHash(proof2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
  });

  it("should generate different hashes for different proof content", () => {
    const proof1 = {
      screenshotUrl: "https://example.com/proof1.jpg",
      link: "https://instagram.com/post/123",
      username: "@user1",
      code: null,
      description: "Task A completed",
    };

    const proof2 = {
      screenshotUrl: "https://example.com/proof2.jpg",
      link: "https://instagram.com/post/456",
      username: "@user2",
      code: null,
      description: "Task B completed",
    };

    const hash1 = generateProofHash(proof1);
    const hash2 = generateProofHash(proof2);

    expect(hash1).not.toBe(hash2);
  });

  it("should normalize proof content before hashing (case insensitive, trimmed)", () => {
    const proof1 = {
      screenshotUrl: "  HTTPS://Example.com/Proof.JPG  ",
      link: "  https://INSTAGRAM.com/post/123  ",
      username: "  @TestUser  ",
      code: null,
      description: "  Task COMPLETED Successfully  ",
    };

    const proof2 = {
      screenshotUrl: "https://example.com/proof.jpg",
      link: "https://instagram.com/post/123",
      username: "@testuser",
      code: null,
      description: "task completed successfully",
    };

    const hash1 = generateProofHash(proof1);
    const hash2 = generateProofHash(proof2);

    // Should be identical after normalization
    expect(hash1).toBe(hash2);
  });

  it("should include all proof fields in hash calculation", () => {
    const baseHash = generateProofHash({
      screenshotUrl: "https://example.com/proof.jpg",
      link: null,
      username: null,
      code: null,
      description: null,
    });

    const withLink = generateProofHash({
      screenshotUrl: "https://example.com/proof.jpg",
      link: "https://instagram.com/post/123",
      username: null,
      code: null,
      description: null,
    });

    const withUsername = generateProofHash({
      screenshotUrl: "https://example.com/proof.jpg",
      link: null,
      username: "@testuser",
      code: null,
      description: null,
    });

    const withCode = generateProofHash({
      screenshotUrl: "https://example.com/proof.jpg",
      link: null,
      username: null,
      code: "ABC123",
      description: null,
    });

    const withDescription = generateProofHash({
      screenshotUrl: "https://example.com/proof.jpg",
      link: null,
      username: null,
      code: null,
      description: "Task completed",
    });

    // All should be different
    const hashes = [
      baseHash,
      withLink,
      withUsername,
      withCode,
      withDescription,
    ];
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(5);
  });

  it("should properly weight duplicate detection in confidence score", () => {
    const hash = generateProofHash(baseProof);
    const proofWithHash = { ...baseProof, contentHash: hash };

    // Test with duplicate detected
    const withDuplicate = runVerificationEngine(
      "instagram_follow",
      ["screenshot", "username"],
      proofWithHash,
      {
        reputationScore: 0.9,
        totalCompleted: 20,
        totalRejected: 1,
        workerId: 1,
      },
      { totalCampaigns: 10, totalDisputes: 0, avgAutoRate: 0.95 },
      { hasDuplicate: true, duplicateCount: 1, byWorker: 1, global: 0 },
    );

    // Test without duplicate
    const withoutDuplicate = runVerificationEngine(
      "instagram_follow",
      ["screenshot", "username"],
      proofWithHash,
      {
        reputationScore: 0.9,
        totalCompleted: 20,
        totalRejected: 1,
        workerId: 1,
      },
      { totalCampaigns: 10, totalDisputes: 0, avgAutoRate: 0.95 },
      { hasDuplicate: false, duplicateCount: 0, byWorker: 0, global: 0 },
    );

    // Score with duplicate should be significantly lower due to 15% weight
    expect(withDuplicate.confidenceScore).toBeLessThan(
      withoutDuplicate.confidenceScore,
    );
    expect(withDuplicate.status).toBe("manual_review");
    expect(withoutDuplicate.status).toBe("auto_approved");
  });
});
