// Duplicate Proof Checker - queries database for existing proofs
import { db, proofsTable, assignmentsTable } from "../db";
import { eq, inArray } from "drizzle-orm";

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateCount: number;
  byWorker: number;
  global: number;
}

/**
 * Check if a proof hash already exists in the database.
 * Returns counts of duplicates by the same worker and globally.
 */
export async function checkForDuplicateProof(
  contentHash: string,
  workerId: number,
  excludeAssignmentId?: number,
): Promise<DuplicateCheckResult> {
  try {
    // Find all proofs with matching hash
    const allMatches = await db
      .select({
        id: proofsTable.id,
        assignmentId: proofsTable.assignmentId,
      })
      .from(proofsTable)
      .where(eq(proofsTable.contentHash, contentHash));

    // Filter out the current assignment if provided
    const relevantMatches = excludeAssignmentId
      ? allMatches.filter((p) => p.assignmentId !== excludeAssignmentId)
      : allMatches;

    if (relevantMatches.length === 0) {
      return {
        hasDuplicate: false,
        duplicateCount: 0,
        byWorker: 0,
        global: 0,
      };
    }

    // Get all assignment info for matches to check worker
    const matchAssignmentIds = relevantMatches.map((p) => p.assignmentId);
    const matchAssignments = await db
      .select({
        id: assignmentsTable.id,
        workerId: assignmentsTable.workerId,
      })
      .from(assignmentsTable)
      .where(inArray(assignmentsTable.id, matchAssignmentIds));

    // Count how many duplicates are from the same worker
    const byWorkerCount = relevantMatches.filter((match) => {
      const assignment = matchAssignments.find(
        (a) => a.id === match.assignmentId,
      );
      return assignment?.workerId === workerId;
    }).length;

    return {
      hasDuplicate: true,
      duplicateCount: relevantMatches.length,
      byWorker: byWorkerCount,
      global: relevantMatches.length - byWorkerCount,
    };
  } catch (err) {
    // Fallback to no duplicate if check fails
    console.error("Error checking duplicate proofs:", err);
    return {
      hasDuplicate: false,
      duplicateCount: 0,
      byWorker: 0,
      global: 0,
    };
  }
}
