// Realtime Notifications System
// Broadcasts events to clients in real-time
// Currently uses in-memory event bus, can be extended to Appwrite Realtime

import { EventEmitter } from 'events';

export type NotificationEventType =
  | 'payment_confirmed'
  | 'proof_submitted'
  | 'verification_completed'
  | 'manual_review_needed'
  | 'wallet_credited'
  | 'task_claimed'
  | 'campaign_created'
  | 'campaign_activated';

export interface NotificationPayload {
  type: NotificationEventType;
  userId?: number;
  clientId?: number;
  workerId?: number;
  admin?: boolean;
  data: Record<string, unknown>;
  timestamp: string;
}

// In-memory event bus for notifications
class NotificationBus extends EventEmitter {
  private static instance: NotificationBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): NotificationBus {
    if (!NotificationBus.instance) {
      NotificationBus.instance = new NotificationBus();
    }
    return NotificationBus.instance;
  }
}

const notificationBus = NotificationBus.getInstance();

export async function broadcastNotification(payload: NotificationPayload): Promise<void> {
  try {
    // Emit to in-memory event bus
    notificationBus.emit('notification', payload);

    // Log for debugging (can be replaced with Appwrite persistence later)
    console.log(`[Notification] ${payload.type}`, payload);
  } catch (error) {
    // Log but don't fail the main operation if notification fails
    console.error('Failed to broadcast notification:', error);
  }
}

export function getNotificationChannel(userId: number, role: string): string {
  if (role === 'admin') return 'admin';
  if (role === 'client') return `client:${userId}`;
  if (role === 'worker') return `worker:${userId}`;
  return `user:${userId}`;
}

// Subscribe to notifications for a specific user/role
export function subscribeToNotifications(
  userId: number,
  role: string,
  callback: (payload: NotificationPayload) => void
): () => void {
  const channel = getNotificationChannel(userId, role);
  
  const handler = (payload: NotificationPayload) => {
    // Check if this notification is relevant to the subscriber
    if (payload.admin && role === 'admin') {
      callback(payload);
    } else if (payload.userId === userId) {
      callback(payload);
    } else if (payload.clientId === userId && role === 'client') {
      callback(payload);
    } else if (payload.workerId === userId && role === 'worker') {
      callback(payload);
    }
  };

  notificationBus.on('notification', handler);

  // Return unsubscribe function
  return () => {
    notificationBus.off('notification', handler);
  };
}

// Helper function to create notification payloads
export function createPaymentConfirmedNotification(
  userId: number,
  amount: number,
  transactionId: number
): NotificationPayload {
  return {
    type: 'payment_confirmed',
    userId,
    data: { amount, transactionId },
    timestamp: new Date().toISOString(),
  };
}

export function createProofSubmittedNotification(
  workerId: number,
  assignmentId: number,
  taskId: number
): NotificationPayload {
  return {
    type: 'proof_submitted',
    workerId,
    data: { assignmentId, taskId },
    timestamp: new Date().toISOString(),
  };
}

export function createVerificationCompletedNotification(
  workerId: number,
  clientId: number,
  assignmentId: number,
  status: string,
  confidenceScore: number
): NotificationPayload {
  return {
    type: 'verification_completed',
    workerId,
    clientId,
    data: { assignmentId, status, confidenceScore },
    timestamp: new Date().toISOString(),
  };
}

export function createManualReviewNeededNotification(
  admin: boolean,
  assignmentId: number,
  confidenceScore: number
): NotificationPayload {
  return {
    type: 'manual_review_needed',
    admin,
    data: { assignmentId, confidenceScore },
    timestamp: new Date().toISOString(),
  };
}

export function createWalletCreditedNotification(
  userId: number,
  amount: number,
  balance: number
): NotificationPayload {
  return {
    type: 'wallet_credited',
    userId,
    data: { amount, balance },
    timestamp: new Date().toISOString(),
  };
}

export function createTaskClaimedNotification(
  workerId: number,
  taskId: number,
  campaignId: number
): NotificationPayload {
  return {
    type: 'task_claimed',
    workerId,
    data: { taskId, campaignId },
    timestamp: new Date().toISOString(),
  };
}

export function createCampaignCreatedNotification(
  clientId: number,
  campaignId: number,
  name: string
): NotificationPayload {
  return {
    type: 'campaign_created',
    clientId,
    data: { campaignId, name },
    timestamp: new Date().toISOString(),
  };
}

export function createCampaignActivatedNotification(
  clientId: number,
  campaignId: number,
  tasksCount: number
): NotificationPayload {
  return {
    type: 'campaign_activated',
    clientId,
    data: { campaignId, tasksCount },
    timestamp: new Date().toISOString(),
  };
}

// Export the event bus for testing purposes
export const getNotificationBus = () => NotificationBus.getInstance();
