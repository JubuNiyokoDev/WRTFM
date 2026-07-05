// Audit Logger
// Records important security and business events for compliance and debugging

import { db, auditLogsTable } from "@/db";

export type AuditEventType =
  | "user_login"
  | "user_logout"
  | "user_register"
  | "campaign_created"
  | "campaign_activated"
  | "campaign_cancelled"
  | "task_claimed"
  | "proof_submitted"
  | "verification_completed"
  | "manual_review"
  | "wallet_deposit"
  | "wallet_withdrawal"
  | "wallet_payout"
  | "admin_action"
  | "permission_denied"
  | "rate_limit_exceeded";

export interface AuditLogData {
  userId?: number;
  userType?: "client" | "worker" | "admin";
  action: AuditEventType;
  resourceType?: string;
  resourceId?: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export async function logAuditEvent(data: AuditLogData): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: data.userId ?? null,
      userType: data.userType ?? null,
      action: data.action,
      resourceType: data.resourceType ?? null,
      resourceId: data.resourceId ?? null,
      details: data.details ? JSON.stringify(data.details) : null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      success: data.success ? "true" : "false",
      errorMessage: data.errorMessage ?? null,
    });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error("Failed to log audit event:", error);
  }
}

// Helper functions for common audit events
export async function logUserLogin(
  userId: number,
  userType: "client" | "worker" | "admin",
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    userId,
    userType,
    action: "user_login",
    ipAddress,
    userAgent,
    success: true,
  });
}

export async function logUserLogout(
  userId: number,
  userType: "client" | "worker" | "admin",
  ipAddress?: string
): Promise<void> {
  await logAuditEvent({
    userId,
    userType,
    action: "user_logout",
    ipAddress,
    success: true,
  });
}

export async function logCampaignCreated(
  userId: number,
  campaignId: number,
  details?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    userId,
    userType: "client",
    action: "campaign_created",
    resourceType: "campaign",
    resourceId: campaignId,
    details,
    success: true,
  });
}

export async function logTaskClaimed(
  userId: number,
  taskId: number,
  campaignId: number
): Promise<void> {
  await logAuditEvent({
    userId,
    userType: "worker",
    action: "task_claimed",
    resourceType: "task",
    resourceId: taskId,
    details: { campaignId },
    success: true,
  });
}

export async function logProofSubmitted(
  userId: number,
  assignmentId: number,
  taskId: number
): Promise<void> {
  await logAuditEvent({
    userId,
    userType: "worker",
    action: "proof_submitted",
    resourceType: "assignment",
    resourceId: assignmentId,
    details: { taskId },
    success: true,
  });
}

export async function logVerificationCompleted(
  assignmentId: number,
  status: string,
  confidenceScore: number,
  userId?: number
): Promise<void> {
  await logAuditEvent({
    userId,
    userType: userId ? "admin" : undefined,
    action: "verification_completed",
    resourceType: "assignment",
    resourceId: assignmentId,
    details: { status, confidenceScore },
    success: true,
  });
}

export async function logManualReview(
  userId: number,
  assignmentId: number,
  decision: string,
  notes?: string
): Promise<void> {
  await logAuditEvent({
    userId,
    userType: "admin",
    action: "manual_review",
    resourceType: "assignment",
    resourceId: assignmentId,
    details: { decision, notes },
    success: true,
  });
}

export async function logWalletTransaction(
  userId: number,
  userType: "client" | "worker",
  action: "wallet_deposit" | "wallet_withdrawal" | "wallet_payout",
  amount: number,
  transactionId?: number
): Promise<void> {
  await logAuditEvent({
    userId,
    userType,
    action,
    resourceType: "transaction",
    resourceId: transactionId,
    details: { amount },
    success: true,
  });
}

export async function logPermissionDenied(
  userId: number,
  resourceType: string,
  resourceId?: number,
  errorMessage?: string
): Promise<void> {
  await logAuditEvent({
    userId,
    action: "permission_denied",
    resourceType,
    resourceId,
    errorMessage,
    success: false,
  });
}

export async function logRateLimitExceeded(
  ipAddress: string,
  endpoint?: string
): Promise<void> {
  await logAuditEvent({
    action: "rate_limit_exceeded",
    ipAddress,
    details: { endpoint },
    success: false,
    errorMessage: "Rate limit exceeded",
  });
}
