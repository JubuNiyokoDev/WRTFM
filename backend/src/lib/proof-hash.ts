// Proof Hash Generator for Duplicate Detection
import { createHash } from "crypto";

interface ProofContent {
  screenshotUrl?: string | null;
  link?: string | null;
  username?: string | null;
  code?: string | null;
  description?: string | null;
}

/**
 * Generate a deterministic SHA-256 hash from proof content.
 * Used for duplicate detection across submissions.
 */
export function generateProofHash(proof: ProofContent): string {
  // Normalize and concatenate all proof fields in a deterministic order
  const normalized = [
    proof.screenshotUrl?.trim().toLowerCase() || "",
    proof.link?.trim().toLowerCase() || "",
    proof.username?.trim().toLowerCase() || "",
    proof.code?.trim() || "",
    proof.description?.trim().toLowerCase() || "",
  ].join("|");

  // Generate SHA-256 hash
  return createHash("sha256").update(normalized).digest("hex");
}
