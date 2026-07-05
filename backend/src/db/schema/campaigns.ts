import { pgTable, serial, integer, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft", "active", "paused", "completed", "cancelled"
]);

export const taskTypeEnum = pgEnum("task_type", [
  "youtube_watch", "youtube_like", "youtube_comment", "youtube_subscribe",
  "instagram_follow", "instagram_like", "instagram_comment",
  "tiktok_follow", "tiktok_like", "tiktok_comment",
  "twitter_follow", "twitter_like", "twitter_retweet",
  "website_visit", "website_signup",
  "app_install", "app_test",
  "form_fill", "content_review", "data_collection"
]);

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  taskType: taskTypeEnum("task_type").notNull(),
  platform: text("platform").notNull(),
  targetUrl: text("target_url"),
  status: campaignStatusEnum("status").notNull().default("draft"),
  budget: real("budget").notNull().default(0),
  spent: real("spent").notNull().default(0),
  rewardPerTask: real("reward_per_task").notNull().default(0),
  workersNeeded: integer("workers_needed").notNull().default(1),
  workersCompleted: integer("workers_completed").notNull().default(0),
  targetCountries: text("target_countries").array().notNull().default([]),
  targetLanguages: text("target_languages").array().notNull().default([]),
  deadline: timestamp("deadline", { withTimezone: true }),
  instructions: text("instructions").notNull().default(""),
  proofRequirements: text("proof_requirements").array().notNull().default([]),
  automationRate: real("automation_rate").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
