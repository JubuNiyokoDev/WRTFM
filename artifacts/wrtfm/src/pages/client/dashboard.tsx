import { useTranslation } from '@/hooks/use-translation';
import { useGetClientSummary, useGetActivityFeed, useGetAutomationStats, useListCampaigns } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap, Megaphone, CheckCircle2, DollarSign, Activity, Play, Pause, CircleStop } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

export default function ClientDashboard() {
  const { t } = useTranslation();
  
  const { data: summary, isLoading: isLoadingSummary } = useGetClientSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetActivityFeed({ limit: 5 });
  const { data: automation, isLoading: isLoadingAuto } = useGetAutomationStats();
  const { data: campaigns, isLoading: isLoadingCampaigns } = useListCampaigns({ limit: 5 });

  if (isLoadingSummary) {
    return <div className="space-y-6"><Skeleton className="h-[200px] w-full" /></div>;
  }

  const automationData = automation?.byTaskType?.map(t => ({
    name: t.taskType.replace('_', ' ').toUpperCase(),
    rate: t.automationRate,
  })) || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight mb-2">Overview</h1>
        <p className="text-muted-foreground">Monitor your campaigns and verification engine.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('client.dash.active_campaigns')}</p>
                <p className="text-3xl font-mono font-bold">{summary?.activeCampaigns || 0}</p>
              </div>
              <div className="w-10 h-10 rounded bg-primary/10 text-primary flex items-center justify-center">
                <Megaphone className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Out of {summary?.totalCampaigns || 0} total</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tasks Completed</p>
                <p className="text-3xl font-mono font-bold">{summary?.totalTasksCompleted?.toLocaleString() || 0}</p>
              </div>
              <div className="w-10 h-10 rounded bg-chart-2/10 text-chart-2 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Published: {summary?.totalTasksPublished?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('client.dash.total_spent')}</p>
                <p className="text-3xl font-mono font-bold">${summary?.totalSpent?.toLocaleString() || 0}</p>
              </div>
              <div className="w-10 h-10 rounded bg-chart-4/10 text-chart-4 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Wallet: ${summary?.walletBalance?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary uppercase tracking-wider">{t('client.dash.automation_rate')}</p>
                <p className="text-3xl font-mono font-bold text-primary">{summary?.automationRate || 0}%</p>
              </div>
              <div className="w-10 h-10 rounded bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-primary/80">Pending manual review: {summary?.pendingVerifications || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Chart */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Automation by Task Type</CardTitle>
            <CardDescription>Engine confidence scores across active platforms</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAuto ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={automationData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      angle={-45}
                      textAnchor="end"
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <RechartsTooltip 
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                      {automationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.rate > 90 ? 'hsl(var(--primary))' : 'hsl(var(--chart-2))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              {t('client.dash.activity_feed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : activity?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t('general.empty')}</div>
            ) : (
              <div className="space-y-6">
                {activity?.map((event) => (
                  <div key={event.id} className="flex gap-4 relative">
                    <div className="w-2 h-2 rounded-full bg-border mt-1.5 flex-none" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{event.description}</p>
                      <p className="text-xs text-muted-foreground font-mono">{format(new Date(event.createdAt), 'MMM d, HH:mm:ss')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('client.dash.recent_campaigns')}</CardTitle>
            <CardDescription>Latest automation jobs</CardDescription>
          </div>
          <Link href="/client/campaigns" className="text-sm text-primary hover:underline font-medium">View all →</Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Campaign</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Progress</th>
                  <th className="pb-3 font-medium text-right">Spent</th>
                  <th className="pb-3 font-medium text-right">Auto Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns?.items?.map(campaign => (
                  <tr key={campaign.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3">
                      <Link href={`/client/campaigns/${campaign.id}`} className="font-medium hover:underline text-foreground">
                        {campaign.title}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5">{campaign.taskType} • {campaign.platform}</div>
                    </td>
                    <td className="py-3">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-muted">
                        {campaign.status === 'active' && <Play className="w-3 h-3 text-primary fill-primary" />}
                        {campaign.status === 'paused' && <Pause className="w-3 h-3 text-chart-4 fill-chart-4" />}
                        {campaign.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-chart-2" />}
                        {campaign.status === 'cancelled' && <CircleStop className="w-3 h-3 text-muted-foreground" />}
                        <span className="capitalize">{campaign.status}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono">
                      {campaign.workersCompleted}/{campaign.workersNeeded}
                    </td>
                    <td className="py-3 text-right font-mono">${campaign.spent}</td>
                    <td className="py-3 text-right">
                      <span className={`font-mono font-medium ${campaign.automationRate && campaign.automationRate > 90 ? 'text-primary' : ''}`}>
                        {campaign.automationRate || 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
