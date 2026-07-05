import { pgTable, serial, integer, real, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit", "withdrawal", "task_reward", "task_payment", "refund", "bonus"
]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending", "completed", "failed", "cancelled"
]);

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  totalEarned: real("total_earned").notNull().default(0),
  totalSpent: real("total_spent").notNull().default(0),
  pendingBalance: real("pending_balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id),
  type: transactionTypeEnum("type").notNull(),
  amount: real("amount").notNull(),
  status: transactionStatusEnum("status").notNull().default("pending"),
  reference: text("reference"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({ id: true, updatedAt: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
