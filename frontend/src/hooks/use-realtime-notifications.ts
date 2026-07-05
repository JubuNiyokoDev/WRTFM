import { useEffect, useState, useCallback } from 'react';
import { realtime } from '@/lib/appwrite';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

export type NotificationType = 
  | 'payment_confirmed'
  | 'proof_submitted'
  | 'verification_completed'
  | 'manual_review_needed'
  | 'wallet_credited'
  | 'task_claimed'
  | 'task_available';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const NOTIFICATION_STORAGE_KEY = 'wrtfm_notifications';

function getStoredNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveNotifications(notifications: Notification[]) {
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(() => getStoredNotifications());
  const [unreadCount, setUnreadCount] = useState(() => 
    getStoredNotifications().filter(n => !n.read).length
  );
  const { toast } = useToast();
  const { t } = useTranslation();

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    
    setNotifications(prev => {
      const updated = [newNotification, ...prev].slice(0, 50);
      saveNotifications(updated);
      return updated;
    });
    
    setUnreadCount(prev => prev + 1);
    
    // Show toast for important notifications
    if (notification.type !== 'task_available') {
      toast({
        title: notification.title,
        description: notification.message,
        variant: notification.type.includes('rejected') || notification.type.includes('failed') ? 'destructive' : 'default',
      });
    }
    
    return newNotification;
  }, [toast]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
      saveNotifications(updated);
      return updated;
    });
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
    setUnreadCount(0);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      saveNotifications(updated);
      return updated;
    });
    setUnreadCount(prev => {
      const notif = notifications.find(n => n.id === id);
      return notif && !notif.read ? Math.max(0, prev - 1) : prev;
    });
  }, [notifications]);

  // Subscribe to realtime events
  useEffect(() => {
    let isMounted = true;
    let paymentSub: any;
    let verificationSub: any;
    let walletSub: any;

    realtime.subscribe([
      `databases.${import.meta.env.VITE_APPWRITE_DATABASE_ID}.collections.payments.documents`,
    ], (response: any) => {
      if (response.events.includes('databases.*.collections.payments.documents.*.update')) {
        const payment = response.payload;
        if (payment.status === 'completed') {
          addNotification({
            type: 'payment_confirmed',
            title: t('notifications.payment_confirmed_title'),
            message: t('notifications.payment_confirmed_desc', { amount: payment.amount }),
            data: { paymentId: payment.$id, amount: payment.amount },
          });
        }
      }
    }).then(sub => {
      if (isMounted) {
        paymentSub = sub;
      } else {
        sub.unsubscribe();
      }
    });

    realtime.subscribe([
      `databases.${import.meta.env.VITE_APPWRITE_DATABASE_ID}.collections.verifications.documents`,
    ], (response: any) => {
      if (response.events.some((e: string) => e.includes('verifications.documents'))) {
        const verification = response.payload;
        if (verification.status === 'auto_approved' || verification.status === 'approved') {
          addNotification({
            type: 'verification_completed',
            title: t('notifications.verification_approved_title'),
            message: t('notifications.verification_approved_desc'),
            data: { verificationId: verification.$id, assignmentId: verification.assignmentId },
          });
        } else if (verification.status === 'auto_rejected' || verification.status === 'rejected') {
          addNotification({
            type: 'verification_completed',
            title: t('notifications.verification_rejected_title'),
            message: t('notifications.verification_rejected_desc'),
            data: { verificationId: verification.$id, assignmentId: verification.assignmentId },
          });
        } else if (verification.status === 'manual_review') {
          addNotification({
            type: 'manual_review_needed',
            title: t('notifications.manual_review_title'),
            message: t('notifications.manual_review_desc'),
            data: { verificationId: verification.$id },
          });
        }
      }
    }).then(sub => {
      if (isMounted) {
        verificationSub = sub;
      } else {
        sub.unsubscribe();
      }
    });

    realtime.subscribe([
      `databases.${import.meta.env.VITE_APPWRITE_DATABASE_ID}.collections.transactions.documents`,
    ], (response: any) => {
      if (response.events.includes('databases.*.collections.transactions.documents.*.create')) {
        const transaction = response.payload;
        if (transaction.type === 'task_reward' && transaction.status === 'completed') {
          addNotification({
            type: 'wallet_credited',
            title: t('notifications.wallet_credited_title'),
            message: t('notifications.wallet_credited_desc', { amount: transaction.amount }),
            data: { transactionId: transaction.$id, amount: transaction.amount },
          });
        }
      }
    }).then(sub => {
      if (isMounted) {
        walletSub = sub;
      } else {
        sub.unsubscribe();
      }
    });

    return () => {
      isMounted = false;
      if (paymentSub) paymentSub.unsubscribe();
      if (verificationSub) verificationSub.unsubscribe();
      if (walletSub) walletSub.unsubscribe();
    };
  }, [addNotification, t]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
  };
}

export function useNotificationCenter() {
  return useRealtimeNotifications();
}