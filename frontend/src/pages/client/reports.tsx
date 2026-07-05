import { useGetTaskTypeBreakdown, useGetAutomationStats, useListCampaigns } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartPanelSkeleton, TableRowsSkeleton } from '@/components/ui/loading-states';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';

export default function ClientReports() {
  const { t } = useTranslation();
  const { data: typeData, isLoading: isTypeLoading } = useGetTaskTypeBreakdown();
  const { data: autoStats, isLoading: isAutoLoading } = useGetAutomationStats();
  const { data: campaigns, isLoading: isCampLoading } = useListCampaigns({ limit: 100 });

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const pieData = typeData?.map(d => ({
    name: d.taskType.replace('_', ' ').toUpperCase(),
    value: d.count
  })) || [];

  const spendData = campaigns?.items?.map(c => ({
    name: c.title.substring(0, 15) + '...',
    spent: c.spent,
    budget: c.budget
  })).slice(0, 10) || [];

  const exportCampaignsCsv = () => {
    const rows = campaigns?.items ?? [];
    if (rows.length === 0) return;

    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const headers = ['id', 'title', 'platform', 'taskType', 'status', 'budget', 'spent', 'workersCompleted', 'workersNeeded', 'automationRate'];
    const csv = [
      headers.join(','),
      ...rows.map((campaign) => headers.map((key) => escapeCsv((campaign as any)[key])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wrtfm-campaign-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="mobile-stack">
        <div>
          <h1 className="page-title">{t('client.reports.title')}</h1>
          <p className="page-subtitle">{t('client.overview.subtitle')}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCampaignsCsv} disabled={isCampLoading || !campaigns?.items?.length}>
          <Download className="w-4 h-4" /> {t('general.export_csv')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('client.reports.distribution')}</CardTitle>
            <CardDescription>{t('client.reports.distribution_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isTypeLoading ? <ChartPanelSkeleton /> : (
              <div className="h-[210px] sm:h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('client.reports.efficiency')}</CardTitle>
            <CardDescription>{t('client.reports.efficiency_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isAutoLoading ? <ChartPanelSkeleton /> : (
              <div className="space-y-8 mt-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-muted-foreground">{t('reports.overall_automation')}</span>
                    <span className="font-mono font-bold">{autoStats?.overallRate || 0}%</span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${autoStats?.overallRate || 0}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border bg-card p-3.5 text-center sm:p-4">
                    <div className="metric-value mb-1 text-chart-2">{autoStats?.autoApproved || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase">{t('reports.auto_approved')}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3.5 text-center sm:p-4">
                    <div className="metric-value mb-1 text-destructive">{autoStats?.autoRejected || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase">{t('reports.auto_rejected')}</div>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border bg-card p-3.5 text-center sm:p-4">
                    <div className="metric-value mb-1 text-chart-4">{autoStats?.manualReview || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase">{t('reports.manual_review')}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('client.reports.spend_budget')}</CardTitle>
          <CardDescription>{t('client.reports.spend_budget_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isCampLoading ? <TableRowsSkeleton rows={5} columns={5} /> : (
            <div className="h-[210px] sm:h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `$${val}`} />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value) => [`$${value}`, undefined]}
                  />
                  <Legend />
                  <Bar dataKey="spent" name={t('reports.spent')} fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="budget" name={t('reports.total_budget')} fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
