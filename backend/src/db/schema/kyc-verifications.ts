import {
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const kycVerificationStatusEnum = pgEnum("kyc_verification_status", [
  "approved",
  "rejected",
  "manual_review",
]);

export const kycVerificationsTable = pgTable("kyc_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: kycVerificationStatusEnum("status").notNull(),
  confidence: real("confidence").notNull().default(0),
  reason: text("reason").notNull(),
  documentType: text("document_type").notNull().default("ikarata_karangamuntu"),
  method: text("method").notNull().default("burundi_kyc_v1"),
  officialNumber: text("official_number"),
  frontDocumentHash: text("front_document_hash").notNull(),
  backDocumentHash: text("back_document_hash").notNull(),
  liveFaceFrameHash: text("live_face_frame_hash").notNull(),
  liveFaceEmbedding: jsonb("live_face_embedding"),
  storageFiles: jsonb("storage_files"),
  encryptedResult: text("encrypted_result").notNull(),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertKycVerificationSchema = createInsertSchema(
  kycVerificationsTable,
).omit({ id: true, createdAt: true });
export type InsertKycVerification = z.infer<typeof insertKycVerificationSchema>;
export type KycVerification = typeof kycVerificationsTable.$inferSelect;
