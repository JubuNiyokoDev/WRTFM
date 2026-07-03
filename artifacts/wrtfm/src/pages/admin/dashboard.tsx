import { useGetAdminSummary, useGetAutomationStats, useGetActivityFeed, useGetTaskTypeBreakdown } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Server, ShieldAlert, Activity, Database } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

export default function AdminDashboard() {
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
        <h1 className="text-3xl font-display font-bold tracking-tight">Platform Control</h1>
        <p className="text-muted-foreground">Global system metrics and automation engine status.</p>
      </div>

      {/* Main Engine Metric */}
      <Card className="bg-primary/5 border-primary/20 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
        <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between relative z-10 gap-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-medium uppercase tracking-wider mb-2">
              <Server className="w-5 h-5" /> Automation Engine Core
            </div>
            {isSumLoading ? <Skeleton className="h-16 w-48" /> : (
              <div className="text-6xl font-mono font-bold text-primary tracking-tighter">
                {summary?.automationRate.toFixed(1)}%
              </div>
            )}
            <p className="text-sm text-primary/80 mt-2 max-w-sm">
              Percentage of tasks globally verified without human intervention over the last 24 hours.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm shrink-0">
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">Total Volume</p>
              <p className="font-mono font-bold text-lg">{summary?.totalVolume?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">Tasks Today</p>
              <p className="font-mono font-bold text-lg text-chart-2">+{summary?.tasksCompletedToday?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">Avg Confidence</p>
              <p className="font-mono font-bold text-lg">{(summary?.avgConfidenceScore || 0).toFixed(1)}/100</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 uppercase tracking-wider text-xs">Processing Time</p>
              <p className="font-mono font-bold text-lg">{automation?.avgProcessingMs || 0}ms</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Users</p>
                {isSumLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-mono font-bold">{summary?.totalUsers?.toLocaleString() || 0}</p>
                )}
              </div>
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span>C: {summary?.totalClients || 0}</span>
              <span>W: {summary?.totalWorkers || 0}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Campaigns</p>
                {isSumLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-mono font-bold">{summary?.totalCampaigns?.toLocaleString() || 0}</p>
                )}
              </div>
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-chart-4/50 bg-chart-4/5 md:col-span-2">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-chart-4 uppercase tracking-wider">Pending Manual Reviews</p>
                {isSumLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-mono font-bold text-chart-4">{summary?.pendingManualReviews || 0}</p>
                )}
              </div>
              <ShieldAlert className="w-5 h-5 text-chart-4" />
            </div>
            <div className="mt-4 text-xs text-chart-4/80">
              Tasks flagged by engine requiring admin resolution.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Engine Performance by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isAutoLoading ? <Skeleton className="h-[250px] w-full" /> : (
              <div className="h-[250px] w-full">
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
            <CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> System Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isActLoading ? <div className="space-y-4"><Skeleton className="h-8 w-full"/><Skeleton className="h-8 w-full"/></div> : (
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
