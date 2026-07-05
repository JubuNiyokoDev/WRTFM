/**
 * REAL DATABASE INTEGRATION TEST
 * Tests actual database operations with real SQL queries
 * Uses the actual PostgreSQL database configured in .env
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  usersTable,
  assignmentsTable,
  tasksTable,
  campaignsTable,
  proofsTable,
} from "../db";
import { eq, sql } from "drizzle-orm";
import { checkForDuplicateProof } from "../lib/duplicate-checker";

describe("REAL DB: Duplicate Detection with Actual SQL Queries", () => {
  let workerId1: number;
  let workerId2: number;
  let taskId: number;
  let assignmentId1: number;
  let assignmentId2: number;
  let assignmentId3: number;

  beforeAll(async () => {
    console.log("\n=== SETTING UP TEST DATA IN REAL DATABASE ===\n");

    // Create test users
    const [user1] = await db
      .insert(usersTable)
      .values({
        email: `test-worker-${Date.now()}-1@test.com`,
        password: "test-hash",
        name: "Test Worker 1",
        role: "worker",
      })
      .returning();
    workerId1 = user1.id;
    console.log(`✓ Created Worker 1: ID=${workerId1}`);

    const [user2] = await db
      .insert(usersTable)
      .values({
        email: `test-worker-${Date.now()}-2@test.com`,
        password: "test-hash",
        name: "Test Worker 2",
        role: "worker",
      })
      .returning();
    workerId2 = user2.id;
    console.log(`✓ Created Worker 2: ID=${workerId2}`);

    // Create test client
    const [client] = await db
      .insert(usersTable)
      .values({
        email: `test-client-${Date.now()}@test.com`,
        password: "test-hash",
        name: "Test Client",
        role: "client",
      })
      .returning();

    // Create campaign
    const [campaign] = await db
      .insert(campaignsTable)
      .values({
        clientId: client.id,
        title: `Integration Test Campaign ${Date.now()}`,
        description: "Integration test campaign",
        taskType: "instagram_follow",
        platform: "instagram",
        status: "active",
        budget: 1000,
        spent: 0,
      })
      .returning();

    // Create task
    const [task] = await db
      .insert(tasksTable)
      .values({
        campaignId: campaign.id,
        title: "Test Task",
        taskType: "instagram_follow",
        platform: "instagram",
        proofRequirements: ["screenshot"],
        status: "available",
        reward: 10,
      })
      .returning();
    taskId = task.id;
    console.log(`✓ Created Task: ID=${taskId}`);

    // Create first assignment
    const [assignment1] = await db
      .insert(assignmentsTable)
      .values({
        taskId,
        workerId: workerId1,
        status: "submitted",
      })
      .returning();
    assignmentId1 = assignment1.id;
    console.log(
      `✓ Created Assignment 1: ID=${assignmentId1} for Worker ${workerId1}`,
    );

    // Create second assignment (different worker, same task)
    const [assignment2] = await db
      .insert(assignmentsTable)
      .values({
        taskId,
        workerId: workerId2,
        status: "submitted",
      })
      .returning();
    assignmentId2 = assignment2.id;
    console.log(
      `✓ Created Assignment 2: ID=${assignmentId2} for Worker ${workerId2}`,
    );

    // Create third assignment (for Worker 1, same task - used in Test 3)
    const [assignment3] = await db
      .insert(assignmentsTable)
      .values({
        taskId,
        workerId: workerId1,
        status: "submitted",
      })
      .returning();
    assignmentId3 = assignment3.id;
    console.log(
      `✓ Created Assignment 3: ID=${assignmentId3} for Worker ${workerId1}\n`,
    );
  });

  afterAll(async () => {
    console.log("\n=== CLEANING UP TEST DATA ===\n");
    try {
      // Delete in reverse order of dependencies
      await db.delete(proofsTable).where(sql`true`);
      await db
        .delete(assignmentsTable)
        .where(
          sql`${assignmentsTable.workerId} = ${workerId1} OR ${assignmentsTable.workerId} = ${workerId2}`,
        );
      await db.delete(tasksTable).where(sql`${tasksTable.id} = ${taskId}`);
      await db.delete(campaignsTable).where(sql`true`);
      await db.delete(usersTable).where(sql`true`);
      console.log("✓ Cleanup complete\n");
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  });

  it("should detect NO duplicate when first proof is inserted with contentHash", async () => {
    console.log("\n--- TEST 1: NO DUPLICATE (First Proof) ---");

    const contentHash = "abc123def456ghi789test1";

    // INSERT first proof to database
    const [proof1] = await db
      .insert(proofsTable)
      .values({
        assignmentId: assignmentId1,
        proofType: "screenshot",
        screenshotUrl: "https://example.com/first.png",
        link: "https://example.com",
        username: "worker1",
        code: "CODE1",
        description: "First proof - unique content",
        contentHash,
        additionalData: {},
      })
      .returning();

    console.log(
      `✓ Inserted Proof 1: ID=${proof1.id}, contentHash=${contentHash}`,
    );

    // CALL checkForDuplicateProof with real SQL query
    const result = await checkForDuplicateProof(
      contentHash,
      workerId1,
      assignmentId1,
    );

    console.log(`\nResult from checkForDuplicateProof():`);
    console.log(`  hasDuplicate: ${result.hasDuplicate}`);
    console.log(`  duplicateCount: ${result.duplicateCount}`);
    console.log(`  byWorker: ${result.byWorker}`);
    console.log(`  global: ${result.global}`);

    // VERIFY: Should be NO duplicate
    expect(result.hasDuplicate).toBe(false);
    expect(result.duplicateCount).toBe(0);
    expect(result.byWorker).toBe(0);
    expect(result.global).toBe(0);

    console.log(`\n✓ PASS: No duplicate detected (correct)`);
  });

  it("should detect DUPLICATE with correct byWorker/global counts", async () => {
    console.log(
      "\n--- TEST 2: DUPLICATE DETECTED (Same contentHash, Different Workers) ---",
    );

    const contentHash = "abc123def456ghi789test2";

    // INSERT first proof (Worker 1)
    const [proof1] = await db
      .insert(proofsTable)
      .values({
        assignmentId: assignmentId1,
        proofType: "screenshot",
        screenshotUrl: "https://example.com/dup.png",
        link: "https://example.com/dup",
        username: "dupuser",
        code: "DUP1",
        description: "Duplicate proof from worker 1",
        contentHash,
        additionalData: {},
      })
      .returning();

    console.log(`✓ Inserted Proof 1 (Worker ${workerId1}): ID=${proof1.id}`);
    console.log(`  contentHash: ${contentHash}`);

    // INSERT second proof with SAME hash (Worker 2)
    const [proof2] = await db
      .insert(proofsTable)
      .values({
        assignmentId: assignmentId2,
        proofType: "screenshot",
        screenshotUrl: "https://example.com/dup.png",
        link: "https://example.com/dup",
        username: "dupuser",
        code: "DUP1",
        description: "Duplicate proof from worker 2",
        contentHash, // SAME HASH
        additionalData: {},
      })
      .returning();

    console.log(`✓ Inserted Proof 2 (Worker ${workerId2}): ID=${proof2.id}`);
    console.log(`  contentHash: ${contentHash} (IDENTICAL)\n`);

    // CALL checkForDuplicateProof from perspective of Worker 1
    console.log(
      `Querying: checkForDuplicateProof("${contentHash}", workerId=${workerId1}, excludeAssignmentId=${assignmentId1})`,
    );
    const result = await checkForDuplicateProof(
      contentHash,
      workerId1,
      assignmentId1,
    );

    console.log(`\nResult from REAL SQL query:`);
    console.log(`  hasDuplicate: ${result.hasDuplicate}`);
    console.log(`  duplicateCount: ${result.duplicateCount}`);
    console.log(
      `  byWorker: ${result.byWorker} (duplicates from Worker ${workerId1})`,
    );
    console.log(`  global: ${result.global} (duplicates from other workers)`);

    // VERIFY: Should find 1 duplicate from Worker 2
    expect(result.hasDuplicate).toBe(true);
    expect(result.duplicateCount).toBe(1); // One other proof with same hash
    expect(result.byWorker).toBe(0); // Zero duplicates from this worker (proof1 is excluded)
    expect(result.global).toBe(1); // One from different worker (Worker 2)

    console.log(
      `\n✓ PASS: Duplicate detected correctly (0 from this worker, 1 from others)`,
    );
  });

  it("should count multiple duplicates from same worker correctly", async () => {
    console.log("\n--- TEST 3: MULTIPLE DUPLICATES FROM SAME WORKER ---");

    const contentHash = "abc123def456ghi789test3";

    // INSERT two proofs for Worker 1 with same contentHash
    const [proof1] = await db
      .insert(proofsTable)
      .values({
        assignmentId: assignmentId1,
        proofType: "screenshot",
        screenshotUrl: "https://example.com/multi1.png",
        link: "https://example.com/multi",
        username: "multiuser",
        code: "MULTI1",
        description: "Multi proof 1 from worker 1",
        contentHash,
        additionalData: {},
      })
      .returning();

    console.log(`✓ Inserted Proof 1 (Worker ${workerId1}): ID=${proof1.id}`);

    const [proof2] = await db
      .insert(proofsTable)
      .values({
        assignmentId: assignmentId3,
        proofType: "screenshot",
        screenshotUrl: "https://example.com/multi1.png",
        link: "https://example.com/multi",
        username: "multiuser",
        code: "MULTI1",
        description: "Multi proof 2 from worker 1",
        contentHash,
        additionalData: {},
      })
      .returning();

    console.log(
      `✓ Inserted Proof 2 (Worker ${workerId1}): ID=${proof2.id} in Assignment 3`,
    );
    console.log(`  Both have contentHash: ${contentHash}\n`);

    // Query from Worker 1's perspective, excluding assignmentId1
    console.log(
      `Querying: checkForDuplicateProof("${contentHash}", workerId=${workerId1}, excludeAssignmentId=${assignmentId1})`,
    );
    const result = await checkForDuplicateProof(
      contentHash,
      workerId1,
      assignmentId1,
    );

    console.log(`\nResult:`);
    console.log(`  hasDuplicate: ${result.hasDuplicate}`);
    console.log(`  duplicateCount: ${result.duplicateCount}`);
    console.log(`  byWorker: ${result.byWorker} (from same worker)`);
    console.log(`  global: ${result.global} (from other workers)`);

    // VERIFY: Should find 1 duplicate from same worker (proof2)
    expect(result.hasDuplicate).toBe(true);
    expect(result.duplicateCount).toBe(1);
    expect(result.byWorker).toBe(1); // One from same worker
    expect(result.global).toBe(0); // None from other workers

    console.log(`\n✓ PASS: Correctly identified 1 duplicate from same worker`);
  });
});
