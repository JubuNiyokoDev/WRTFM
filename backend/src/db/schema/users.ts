import { pgTable, serial, text, boolean, real, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["client", "worker", "admin"]);
export const languageEnum = pgEnum("language", ["fr", "en"]);
export const kycStatusEnum = pgEnum("kyc_status", ["unverified", "pending", "verified", "rejected"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("worker"),
  country: text("country"),
  language: languageEnum("language").notNull().default("fr"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  reputationScore: real("reputation_score").notNull().default(0),
  kycStatus: kycStatusEnum("kyc_status").notNull().default("unverified"),
  kycData: jsonb("kyc_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
