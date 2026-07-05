import { pgTable, serial, integer, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable, taskTypeEnum } from "./campaigns";

export const taskStatusEnum = pgEnum("task_status", [
  "available", "in_progress", "completed", "expired", "cancelled"
]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  title: text("title").notNull(),
  taskType: taskTypeEnum("task_type").notNull(),
  platform: text("platform").notNull(),
  targetUrl: text("target_url"),
  reward: real("reward").notNull().default(0),
  status: taskStatusEnum("status").notNull().default("available"),
  instructions: text("instructions").notNull().default(""),
  proofRequirements: text("proof_requirements").array().notNull().default([]),
  estimatedMinutes: integer("estimated_minutes").notNull().default(5),
  deadline: timestamp("deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
