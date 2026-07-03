import { pgTable, serial, integer, real, timestamp, pgEnum, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "pending", "in_progress", "submitted", "approved", "rejected", "expired"
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending", "auto_approved", "auto_rejected", "manual_review", "approved", "rejected"
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "automatic", "manual", "hybrid"
]);

export const proofTypeEnum = pgEnum("proof_type", [
  "screenshot", "link", "username", "code", "text", "combined"
]);

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  status: assignmentStatusEnum("status").notNull().default("in_progress"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  reward: real("reward"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const proofsTable = pgTable("proofs", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id),
  proofType: proofTypeEnum("proof_type").notNull(),
  screenshotUrl: text("screenshot_url"),
  link: text("link"),
  username: text("username"),
  code: text("code"),
  description: text("description"),
  additionalData: jsonb("additional_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verificationsTable = pgTable("verifications", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id),
  status: verificationStatusEnum("status").notNull().default("pending"),
  confidenceScore: real("confidence_score").notNull().default(0),
  method: verificationMethodEnum("method").notNull().default("automatic"),
  checks: jsonb("checks").notNull().default([]),
  reviewNotes: text("review_notes"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const activityEventsTable = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  userId: integer("user_id"),
  userName: text("user_name"),
  campaignId: integer("campaign_id"),
  taskId: integer("task_id"),
  amount: real("amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignmentsTable.$inferSelect;

export const insertVerificationSchema = createInsertSchema(verificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verificationsTable.$inferSelect;
