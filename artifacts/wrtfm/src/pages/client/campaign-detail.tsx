import { useParams, Link } from 'wouter';
import { useGetCampaign, useGetCampaignStats, useGetCampaignTasks, useUpdateCampaign, getGetCampaignQueryKey, getGetCampaignStatsQueryKey, getGetCampaignTasksQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Play, Pause, AlertCircle, ArrowLeft, BarChart3, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';

export default function ClientCampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: campaign, isLoading: isCampLoading } = useGetCampaign(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) } });
  const { data: stats, isLoading: isStatsLoading } = useGetCampaignStats(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignStatsQueryKey(campaignId) } });
  const { data: tasks, isLoading: isTasksLoading } = useGetCampaignTasks(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignTasksQueryKey(campaignId) } });
  
  const updateMutation = useUpdateCampaign();

  const handleStatusChange = (newStatus: 'active' | 'paused') => {
    updateMutation.mutate({ id: campaignId, data: { status: newStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      }
    });
  };

  if (isCampLoading || !campaign) {
    return <div className="p-8 space-y-6"><Skeleton className="h-32 w-full" /><div className="grid grid-cols-3 gap-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div></div>;
  }

  const progress = (campaign.workersCompleted / campaign.workersNeeded) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground mb-4">
        <Link href="/client/campaigns" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to campaigns
        </Link>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight mb-2">{campaign.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="uppercase tracking-wide font-medium bg-muted px-2 py-0.5 rounded text-foreground">{campaign.platform}</span>
            <span>•</span>
            <span className="capitalize">{campaign.taskType.replace('_', ' ')}</span>
            <span>•</span>
            <span>Created {format(new Date(campaign.createdAt), 'MMM d, yyyy')}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
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
              <Pause className="w-4 h-4 mr-2" /> Pause
            </Button>
          ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
            <Button onClick={() => handleStatusChange('active')} disabled={updateMutation.isPending}>
              <Play className="w-4 h-4 mr-2" /> Activate
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Completion Progress</span>
              <span className="font-mono">{campaign.workersCompleted} / {campaign.workersNeeded} tasks</span>
            </div>
            <Progress value={progress} className="h-3 mb-4" />
            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Budget Spent</p>
                <p className="text-2xl font-mono font-bold">${campaign.spent} <span className="text-sm text-muted-foreground font-normal">/ ${campaign.budget}</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reward per task</p>
                <p className="text-2xl font-mono font-bold">${campaign.rewardPerTask}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 flex flex-col justify-center h-full">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <p className="text-sm font-medium text-primary uppercase tracking-wider">Engine Confidence</p>
            </div>
            {isStatsLoading ? <Skeleton className="h-10 w-24" /> : (
              <div>
                <p className="text-4xl font-mono font-bold text-primary mb-1">{stats?.automationRate || 0}%</p>
                <p className="text-sm text-primary/80">Avg score: {(stats?.avgConfidenceScore || 0).toFixed(1)}/100</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col justify-center h-full">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Verification Results</p>
            {isStatsLoading ? <Skeleton className="h-16 w-full" /> : (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-chart-2" /> Approved</span>
                  <span className="font-mono font-medium">{stats?.approved || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-destructive" /> Rejected</span>
                  <span className="font-mono font-medium">{stats?.rejected || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-chart-4" /> Pending</span>
                  <span className="font-mono font-medium">{stats?.pending || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generated Tasks</CardTitle>
          <CardDescription>Individual tasks assigned to workers</CardDescription>
        </CardHeader>
        <CardContent>
          {isTasksLoading ? (
            <div className="space-y-4"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div>
          ) : tasks?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No tasks generated yet.</div>
          ) : (
             <div className="overflow-x-auto">
               <table className="w-full text-sm">
                 <thead>
                   <tr className="border-b border-border text-left text-muted-foreground">
                     <th className="pb-3 font-medium">Task ID</th>
                     <th className="pb-3 font-medium">Status</th>
                     <th className="pb-3 font-medium">Platform</th>
                     <th className="pb-3 font-medium text-right">Created</th>
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
                   Showing 10 of {tasks.length} tasks
                 </div>
               )}
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
