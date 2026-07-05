import { useGetAdminSummary, useGetAutomationStats, useGetActivityFeed, useGetTaskTypeBreakdown } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CardListSkeleton, ChartPanelSkeleton, MetricGridSkeleton } from '@/components/ui/loading-states';
import { Users, Server, ShieldAlert, Activity, Database } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { data: summary, isLoading: isSumLoading } = useGetAdminSummary();
  const { data: activity, isLoading: isActLoading } = useGetActivityFeed({ limit: 8 });
  const { data: automation, isLoading: isAutoLoading } = useGetAutomationStats();
  const { data: types, isLoading: isTypeLoading } = useGetTaskTypeBreakdown();

  const automationData = automation?.byTaskType?.map(t => ({
    name: t.taskType.replace('_', ' ').toUpperCase(),
    rate: t.automationRate,
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('admin.control.title')}</h1>
        <p className="page-subtitle">{t('admin.control.subtitle')}</p>
      </div>

      {/* Main Engine Metric */}
      <Card className="bg-primary/5 border-primary/20 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
        <CardContent className="relative z-10 flex flex-col items-center justify-between gap-3 p-3.5 sm:gap-4 sm:p-4 md:flex-row lg:p-5">
          <div>
            <div className="flex items-center gap-2 text-primary font-medium uppercase tracking-wider mb-2">
              <Server className="h-4 w-4 sm:h-5 sm:w-5" /> {t('admin.control.engine_core')}
            </div>
            {isSumLoading ? <Skeleton className="h-8 w-40 rounded-md sm:h-10" /> : (
              <div className="metric-value-lg text-primary tracking-normal">
                {summary?.automationRate.toFixed(1)}%
              </div>
            )}
            <p className="text-sm text-primary/80 mt-2 max-w-sm">
              {t('admin.control.engine_core_desc')}
            </p>
          </div>
          
          <AppIllustration kind="review" className="hidden max-w-[190px] lg:block" />
          <div className="grid w-full grid-cols-2 gap-x-6 gap-y-4 text-sm md:w-auto md:shrink-0">
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">{t('admin.dash.volume')}</p>
              <p className="metric-value">{summary?.totalVolume?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">{t('admin.dashboard.tasks_today')}</p>
              <p className="metric-value text-chart-2">+{summary?.tasksCompletedToday?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">{t('admin.dashboard.avg_confidence')}</p>
              <p className="metric-value">{(summary?.avgConfidenceScore || 0).toFixed(1)}/100</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">{t('admin.dashboard.processing_time')}</p>
              <p className="metric-value">{automation?.avgProcessingMs || 0}ms</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isSumLoading ? (
          <div className="md:col-span-4">
            <MetricGridSkeleton count={4} />
          </div>
        ) : (
          <>
        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('admin.dash.total_users')}</p>
                {isSumLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="metric-value">{summary?.totalUsers?.toLocaleString() || 0}</p>
                )}
              </div>
              <Users className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
            </div>
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span>C: {summary?.totalClients || 0}</span>
              <span>W: {summary?.totalWorkers || 0}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('nav.campaigns')}</p>
                {isSumLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="metric-value">{summary?.totalCampaigns?.toLocaleString() || 0}</p>
                )}
              </div>
              <Database className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-chart-4/50 bg-chart-4/5 md:col-span-2">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-chart-4 uppercase tracking-wider">{t('admin.dash.pending_reviews')}</p>
                {isSumLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="metric-value text-chart-4">{summary?.pendingManualReviews || 0}</p>
                )}
              </div>
              <ShieldAlert className="h-4 w-4 text-chart-4 sm:h-5 sm:w-5" />
            </div>
            <div className="mt-4 text-xs text-chart-4/80">
              {t('admin.manual.subtitle')}
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('client.overview.automation_by_type')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isAutoLoading ? <ChartPanelSkeleton /> : (
              <div className="h-[200px] sm:h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={automationData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} angle={-45} textAnchor="end" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                    <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                      {automationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.rate > 95 ? 'hsl(var(--primary))' : entry.rate > 85 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> {t('worker.activity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isActLoading ? <CardListSkeleton count={4} /> : (
              <div className="space-y-4">
                {activity?.map(event => (
                  <div key={event.id} className="text-sm">
                    <p className="font-medium text-foreground leading-snug">{event.description}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{format(new Date(event.createdAt), 'MMM d, HH:mm:ss')}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
