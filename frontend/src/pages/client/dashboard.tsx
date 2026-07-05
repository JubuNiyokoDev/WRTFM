import { useEffect, useState, useRef } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { createCryptoDeposit, type CryptoDepositResponse, useGetClientSummary, useGetActivityFeed, useGetAutomationStats, useListCampaigns } from '@/api-client';
import { Copy, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CardListSkeleton, ChartPanelSkeleton, MetricGridSkeleton } from '@/components/ui/loading-states';
import { Zap, Megaphone, DollarSign, Activity, Play, Pause, CircleStop, Clock as ClockIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { AppIllustration } from '@/components/illustrations';
import QRCode from 'qrcode';

export default function ClientDashboard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState(50);
  const [deposit, setDeposit] = useState<CryptoDepositResponse | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  const { data: summary, isLoading: isLoadingSummary } = useGetClientSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetActivityFeed({ limit: 5 });
  const { data: automation, isLoading: isLoadingAuto } = useGetAutomationStats();
  const { data: campaigns, isLoading: isLoadingCampaigns } = useListCampaigns({ limit: 5 });
  const depositMutation = useMutation({
    mutationFn: createCryptoDeposit,
    onSuccess: (data) => setDeposit(data),
    onError: (error: any) => {
      toast({
        title: t('general.error'),
        description: error?.data?.error || error.message || t('general.error'),
        variant: 'destructive',
      });
    },
  });

  if (isLoadingSummary) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="mt-2 h-3 w-64 max-w-full rounded-md" />
        </div>
        <MetricGridSkeleton />
        <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardContent className="p-3.5 sm:p-4">
              <ChartPanelSkeleton />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3.5 sm:p-4">
              <CardListSkeleton count={4} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const automationData = automation?.byTaskType?.map(t => ({
    name: t.taskType.replace('_', ' ').toUpperCase(),
    rate: t.automationRate,
  })) || [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="page-title">{t('client.overview.title')}</h1>
        <p className="page-subtitle">{t('client.overview.subtitle')}</p>
      </div>

      {/* KPI Cards */}
      <div className="metric-grid">
        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('client.dash.active_campaigns')}</p>
                <p className="metric-value">{summary?.activeCampaigns || 0}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10 text-primary sm:h-10 sm:w-10">
                <Megaphone className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">{t('client.overview.out_of').replace('{total}', String(summary?.totalCampaigns || 0))}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('client.overview.tasks_completed')}</p>
                <p className="metric-value">{summary?.totalTasksCompleted?.toLocaleString() || 0}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-chart-2/10 text-chart-2 sm:h-10 sm:w-10">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">{t('client.overview.published')}: {summary?.totalTasksPublished?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('client.dash.total_spent')}</p>
                <p className="metric-value">${summary?.totalSpent?.toLocaleString() || 0}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-chart-4/10 text-chart-4 sm:h-10 sm:w-10">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">{t('client.overview.wallet')}: ${summary?.walletBalance?.toLocaleString() || 0}</div>
              <Dialog onOpenChange={(open) => !open && setDeposit(null)}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">{t('client.overview.deposit')}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('client.overview.crypto_deposit')}</DialogTitle>
                    <DialogDescription>
                      {t('client.overview.crypto_deposit_desc')}
                    </DialogDescription>
                  </DialogHeader>
                  {!deposit ? (
                    <div className="space-y-4">
                      <AppIllustration kind="wallet" variant="transfer" className="mx-auto max-w-[180px]" fit="contain" />
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('client.overview.amount_usd')}</label>
                        <Input
                          type="number"
                          min={10}
                          step="0.01"
                          value={depositAmount}
                          onChange={(event) => setDepositAmount(Number(event.target.value))}
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={depositMutation.isPending || depositAmount < 10}
                        onClick={() => depositMutation.mutate({ amount: depositAmount, priceCurrency: 'usd' })}
                      >
                        {depositMutation.isPending ? t('general.loading') : t('client.overview.create_payment')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-[16px] border border-border bg-muted/30 p-4">
                        <div className="text-muted-foreground">{t('client.overview.payment_status')}</div>
                        <div className="font-mono font-semibold">{deposit.status}</div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[16px] border border-border p-4">
                          <div className="text-muted-foreground">{t('client.overview.pay_amount')}</div>
                          <div className="font-mono font-semibold">{deposit.payAmount ?? '-'} {deposit.payCurrency ?? ''}</div>
                        </div>
                        <div className="rounded-[16px] border border-border p-4">
                          <div className="text-muted-foreground">{t('client.overview.payment_id')}</div>
                          <div className="font-mono text-xs break-all">{deposit.paymentId ?? '-'}</div>
                        </div>
                      </div>
                      <div className="rounded-[16px] border border-border p-4">
                        <div className="text-muted-foreground">{t('client.overview.payment_address')}</div>
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                          <div className="font-mono text-xs break-all flex-1">{deposit.payAddress ?? t('client.overview.no_address')}</div>
                          <div className="flex items-center gap-2 mt-2 sm:mt-0">
                            {deposit.payAddress && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  navigator.clipboard.writeText(deposit.payAddress || '');
                                  toast({ title: t('general.copied'), description: t('general.address_copied') });
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">{t('client.overview.scan_qr_code')}</div>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
          <CardContent className="p-3.5 sm:p-4 relative z-10">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary uppercase tracking-wider">{t('client.dash.automation_rate')}</p>
                <p className="metric-value text-primary">{summary?.automationRate || 0}%</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm sm:h-10 sm:w-10">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-primary/80">{t('client.overview.pending_review')}: {summary?.pendingVerifications || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Main Chart */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('client.overview.automation_by_type')}</CardTitle>
            <CardDescription>{t('client.overview.engine_metrics')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAuto ? (
              <ChartPanelSkeleton />
            ) : (
              <div className="h-[210px] sm:h-[240px] w-full">
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
              <CardListSkeleton count={4} />
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
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('client.dash.recent_campaigns')}</CardTitle>
            <CardDescription>{t('client.overview.latest_jobs')}</CardDescription>
          </div>
          <Link href="/client/campaigns" className="text-sm font-medium text-primary hover:underline">{t('general.view_all')} →</Link>
        </CardHeader>
        <CardContent>
          <div className="responsive-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">{t('nav.campaigns')}</th>
                  <th className="pb-3 font-medium">{t('general.status')}</th>
                  <th className="pb-3 font-medium text-right">{t('general.progress')}</th>
                  <th className="pb-3 font-medium text-right">{t('general.spent')}</th>
                  <th className="pb-3 font-medium text-right">{t('general.auto_rate')}</th>
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
