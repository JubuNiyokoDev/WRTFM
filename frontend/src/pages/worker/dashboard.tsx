import { useGetWorkerSummary, useListAvailableTasks, useGetActivityFeed } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CardListSkeleton, MetricGridSkeleton } from '@/components/ui/loading-states';
import { Wallet, Award, Activity, Clock, CheckCircle2, ChevronRight, ListChecks } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

export default function WorkerDashboard() {
  const { t } = useTranslation();
  const { data: summary, isLoading: isSummaryLoading } = useGetWorkerSummary();
  const { data: tasks, isLoading: isTasksLoading } = useListAvailableTasks({ limit: 4 });
  const { data: activity, isLoading: isActivityLoading } = useGetActivityFeed({ limit: 5 });

  const getReputationColor = (level: string | undefined) => {
    switch(level) {
      case 'bronze': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'silver': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
      case 'gold': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'platinum': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('worker.dashboard.title')}</h1>
        <p className="page-subtitle">{t('worker.dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {isSummaryLoading ? (
          <div className="md:col-span-3">
            <MetricGridSkeleton count={3} />
          </div>
        ) : (
          <>
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('worker.balance')}</p>
                {isSummaryLoading ? <Skeleton className="h-10 w-24" /> : (
                  <p className="metric-value text-foreground">${summary?.walletBalance?.toFixed(2) || '0.00'}</p>
                )}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10 text-primary sm:h-10 sm:w-10">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground flex justify-between items-center">
              <span>{t('worker.pending')}: ${summary?.pendingEarnings?.toFixed(2) || '0.00'}</span>
              <Link href="/worker/earnings" className="text-primary hover:underline">{t('worker.withdraw')}</Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('worker.reputation_score')}</p>
                {isSummaryLoading ? <Skeleton className="h-10 w-24" /> : (
                  <div className="flex items-center gap-3">
                    <p className="metric-value">{summary?.reputationScore || 0}</p>
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${getReputationColor(summary?.reputationLevel)}`}>
                      {summary?.reputationLevel || 'Newcomer'}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-chart-4/10 text-chart-4 sm:h-10 sm:w-10">
                <Award className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">{t('worker.validation_rate')}: {summary?.validationRate || 0}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('worker.tasks_completed')}</p>
                {isSummaryLoading ? <Skeleton className="h-10 w-24" /> : (
                  <p className="metric-value">{summary?.tasksCompleted || 0}</p>
                )}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-chart-2/10 text-chart-2 sm:h-10 sm:w-10">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              {t('worker.tasks_available_now').replace('{count}', String(summary?.tasksAvailable || 0))}
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="md:col-span-2 space-y-4">
          <div className="mobile-stack">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
                <ListChecks className="h-4 w-4 text-primary sm:h-5 sm:w-5" /> {t('worker.available_tasks')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('worker.tasks.subtitle')}</p>
            </div>
            <Link href="/worker/tasks" className="text-sm text-primary hover:underline font-medium">{t('general.view_all')}</Link>
          </div>

          {isTasksLoading ? (
            <CardListSkeleton count={3} />
          ) : tasks?.items?.length === 0 ? (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="grid place-items-center gap-2 p-4 sm:p-5 text-center text-muted-foreground">
                <AppIllustration kind="empty" className="max-w-[170px]" />
                <span>{t('worker.no_tasks_now')}</span>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {tasks?.items?.map(task => (
                <Link key={task.id} href={`/worker/tasks/${task.id}`}>
                  <Card className="hover-elevate cursor-pointer group transition-all duration-200">
                    <CardContent className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {task.platform === 'instagram' ? 'IG' : task.platform === 'youtube' ? 'YT' : 'TK'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground group-hover:text-primary truncate">{task.title}</h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="uppercase tracking-wide">{task.taskType.replace('_', ' ')}</span>
                          {task.estimatedMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {task.estimatedMinutes}m</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-base font-bold text-primary sm:text-lg">${task.reward.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground flex items-center justify-end gap-1 group-hover:text-primary transition-colors">
                          {t('worker.claim')} <ChevronRight className="w-3 h-3" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <Activity className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" /> {t('worker.activity')}
          </h2>
          <Card>
            <CardContent className="p-0">
              {isActivityLoading ? (
                <div className="p-3.5 sm:p-4"><CardListSkeleton count={3} /></div>
              ) : activity?.length === 0 ? (
                <div className="p-4 sm:p-5 text-center text-muted-foreground text-sm">{t('worker.no_activity')}</div>
              ) : (
                <div className="divide-y divide-border">
                  {activity?.map(event => (
                    <div key={event.id} className="p-4 text-sm">
                      <p className="font-medium">{event.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{format(new Date(event.createdAt), 'MMM d, HH:mm')}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
