import { pgTable, serial, integer, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const auditActionEnum = pgEnum("audit_action", [
  "user_login",
  "user_logout",
  "user_register",
  "campaign_created",
  "campaign_activated",
  "campaign_cancelled",
  "task_claimed",
  "proof_submitted",
  "verification_completed",
  "manual_review",
  "wallet_deposit",
  "wallet_withdrawal",
  "wallet_payout",
  "admin_action",
  "permission_denied",
  "rate_limit_exceeded",
]);

export const auditUserTypeEnum = pgEnum("audit_user_type", ["client", "worker", "admin"]);

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  userType: auditUserTypeEnum("user_type"),
  action: auditActionEnum("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: integer("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  success: text("success").notNull().default("true"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
