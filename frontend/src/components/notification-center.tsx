import { useState } from 'react';
import { Bell, BellOff, Check, X, CheckCheck, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from '@/hooks/use-translation';
import { useNotificationCenter } from '@/hooks/use-realtime-notifications';
import { AppIllustration } from '@/components/illustrations';

const notificationIcons: Record<string, () => React.ReactNode> = {
  payment_confirmed: () => <Bell className="w-5 h-5 text-chart-2" />,
  proof_submitted: () => <Bell className="w-5 h-5 text-primary" />,
  verification_completed: () => <CheckCheck className="w-5 h-5 text-chart-2" />,
  manual_review_needed: () => <Bell className="w-5 h-5 text-chart-4" />,
  wallet_credited: () => <Bell className="w-5 h-5 text-chart-2" />,
  task_claimed: () => <Bell className="w-5 h-5 text-primary" />,
  task_available: () => <RotateCcw className="w-5 h-5 text-muted-foreground" />,
};

const notificationColors: Record<string, string> = {
  payment_confirmed: 'border-chart-2/20 bg-chart-2/5',
  proof_submitted: 'border-primary/20 bg-primary/5',
  verification_completed: 'border-chart-2/20 bg-chart-2/5',
  manual_review_needed: 'border-chart-4/20 bg-chart-4/5',
  wallet_credited: 'border-chart-2/20 bg-chart-2/5',
  task_claimed: 'border-primary/20 bg-primary/5',
  task_available: 'border-muted/20 bg-muted/5',
};

export function NotificationCenter() {
  const { t } = useTranslation();
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    removeNotification 
  } = useNotificationCenter();
  const [isOpen, setIsOpen] = useState(false);

  if (notifications.length === 0 && unreadCount === 0) {
    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setIsOpen(true)}
        >
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] flex items-center justify-center">
            {unreadCount > 0 ? unreadCount : ''}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] flex items-center justify-center text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 md:p-0">
          <div 
            className="absolute inset-0 bg-black/20" 
            onClick={() => setIsOpen(false)}
          />
          <div className="relative w-full max-w-sm md:max-w-md lg:max-w-lg bg-card rounded-[20px] shadow-xl border border-border overflow-hidden flex flex-col max-h-[60vh]">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-6 h-6 text-primary" />
                <h3 className="font-display font-bold">{t('notifications.center_title')}</h3>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    {t('notifications.mark_all_read')}
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {notifications.map((notification) => {
                    const IconComponent = notificationIcons[notification.type];
                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-3 p-3 rounded-[14px] border transition-all ${
                          notificationColors[notification.type] || 'border-border bg-muted/30'
                        } ${!notification.read ? 'ring-1 ring-primary/20' : 'opacity-70'}`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {IconComponent ? (
                            IconComponent()
                          ) : (
                            <Bell className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => markAsRead(notification.id)}
                          title={t('notifications.mark_read')}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeNotification(notification.id)}
                        title={t('notifications.dismiss')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
                })}
              </div>
            </ScrollArea>

            {notifications.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <AppIllustration kind="empty" className="mx-auto mb-3 max-w-[180px]" />
                <p className="text-sm">{t('notifications.empty')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  const { unreadCount } = useNotificationCenter();
  
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] flex items-center justify-center text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Button>
  );
}