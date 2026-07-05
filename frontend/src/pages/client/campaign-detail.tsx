import { useParams, Link } from 'wouter';
import { useGetCampaign, useGetCampaignStats, useGetCampaignTasks, useUpdateCampaign, getGetCampaignQueryKey, getGetCampaignStatsQueryKey, getGetCampaignTasksQueryKey } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailPageSkeleton, TableRowsSkeleton } from '@/components/ui/loading-states';
import { format } from 'date-fns';
import { Play, Pause, AlertCircle, ArrowLeft, BarChart3, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';
import { useToast } from '@/hooks/use-toast';

export default function ClientCampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: campaign, isLoading: isCampLoading } = useGetCampaign(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) } });
  const { data: stats, isLoading: isStatsLoading } = useGetCampaignStats(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignStatsQueryKey(campaignId) } });
  const { data: tasks, isLoading: isTasksLoading } = useGetCampaignTasks(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignTasksQueryKey(campaignId) } });
  
  const updateMutation = useUpdateCampaign();

  const handleStatusChange = (newStatus: 'active' | 'paused') => {
    updateMutation.mutate({ id: campaignId, data: { status: newStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
        toast({
          title: t('general.success') ?? 'Success',
          description: t('client.campaigns.status_updated') ?? 'Campaign status updated successfully.',
        });
      },
      onError: (err: any) => {
        const errorMessage = err?.data?.error || err?.message || 'An error occurred';
        toast({
          variant: 'destructive',
          title: t('general.error') ?? 'Error',
          description: errorMessage,
        });
      }
    });
  };

  if (isCampLoading || !campaign) {
    return <DetailPageSkeleton />;
  }

  const progress = (campaign.workersCompleted / campaign.workersNeeded) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground mb-4">
        <Link href="/client/campaigns" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> {t('client.campaigns.back')}
        </Link>
      </div>

      <div className="flex flex-col gap-4 rounded-[16px] border border-border bg-card p-3.5 shadow-sm sm:p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="page-title">{campaign.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="uppercase tracking-wide font-medium bg-muted px-2 py-0.5 rounded text-foreground">{campaign.platform}</span>
            <span>•</span>
            <span className="capitalize">{campaign.taskType.replace('_', ' ')}</span>
            <span>•</span>
            <span>{t('general.created')} {format(new Date(campaign.createdAt), 'MMM d, yyyy')}</span>
          </div>
        </div>
        
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <div className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize flex items-center gap-2 border ${
            campaign.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' : 
            campaign.status === 'paused' ? 'bg-chart-4/10 text-chart-4 border-chart-4/20' : 
            'bg-muted text-muted-foreground border-transparent'
          }`}>
            {campaign.status === 'active' && <Play className="w-4 h-4 fill-current" />}
            {campaign.status === 'paused' && <Pause className="w-4 h-4 fill-current" />}
            {campaign.status}
          </div>
          
          {campaign.status === 'active' ? (
            <Button variant="outline" onClick={() => handleStatusChange('paused')} disabled={updateMutation.isPending}>
              <Pause className="w-4 h-4 mr-2" /> {t('client.campaigns.pause')}
            </Button>
          ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
            <Button onClick={() => handleStatusChange('active')} disabled={updateMutation.isPending}>
              <Play className="w-4 h-4 mr-2" /> {t('client.campaigns.activate')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">{t('general.progress')}</span>
              <span className="font-mono">{campaign.workersCompleted} / {campaign.workersNeeded} {t('client.campaigns.tasks_label')}</span>
            </div>
            <Progress value={progress} className="h-3 mb-4" />
            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('general.spent')}</p>
                <p className="metric-value">${campaign.spent} <span className="text-sm text-muted-foreground font-normal">/ ${campaign.budget}</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('client.campaigns.reward_task')}</p>
                <p className="metric-value">${campaign.rewardPerTask}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-center h-full">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              <p className="text-sm font-medium text-primary uppercase tracking-wider">{t('client.campaigns.engine_confidence')}</p>
            </div>
            {isStatsLoading ? <Skeleton className="h-10 w-24" /> : (
              <div>
                <p className="metric-value mb-1 text-primary">{stats?.automationRate || 0}%</p>
                <p className="text-sm text-primary/80">{t('client.campaigns.avg_score')}: {(stats?.avgConfidenceScore || 0).toFixed(1)}/100</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-center h-full">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">{t('client.campaigns.verification_results')}</p>
            {isStatsLoading ? <Skeleton className="h-16 w-full" /> : (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-chart-2" /> {t('status.approved')}</span>
                  <span className="font-mono font-medium">{stats?.approved || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-destructive" /> {t('status.rejected')}</span>
                  <span className="font-mono font-medium">{stats?.rejected || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-chart-4" /> {t('status.pending')}</span>
                  <span className="font-mono font-medium">{stats?.pending || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('client.campaigns.generated_tasks')}</CardTitle>
          <CardDescription>{t('client.campaigns.generated_tasks_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isTasksLoading ? (
            <TableRowsSkeleton rows={4} columns={4} />
          ) : tasks?.length === 0 ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-muted-foreground">
              <AppIllustration kind="empty" className="max-w-[170px]" />
              {t('client.campaigns.no_tasks')}
            </div>
          ) : (
             <div className="responsive-table">
               <table className="w-full text-sm">
                 <thead>
                   <tr className="border-b border-border text-left text-muted-foreground">
                     <th className="pb-3 font-medium">{t('general.task_id')}</th>
                     <th className="pb-3 font-medium">{t('general.status')}</th>
                     <th className="pb-3 font-medium">{t('general.platform')}</th>
                     <th className="pb-3 font-medium text-right">{t('general.created')}</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                   {tasks?.slice(0, 10).map((task) => (
                     <tr key={task.id} className="hover:bg-muted/50">
                       <td className="py-3 font-mono">#{task.id}</td>
                       <td className="py-3">
                         <span className="px-2 py-1 bg-muted rounded text-xs capitalize">{task.status.replace('_', ' ')}</span>
                       </td>
                       <td className="py-3">{task.platform}</td>
                       <td className="py-3 text-right text-muted-foreground">{format(new Date(task.createdAt), 'MMM d, HH:mm')}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               {tasks && tasks.length > 10 && (
                 <div className="text-center pt-4 text-sm text-muted-foreground border-t border-border mt-2">
                   {t('general.showing_count').replace('{shown}', '10').replace('{total}', String(tasks.length))}
                 </div>
               )}
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
