import { useGetWorkerSummary, useListAvailableTasks, useGetActivityFeed } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Award, Activity, Clock, CheckCircle2, ChevronRight, ListChecks } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function WorkerDashboard() {
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
        <h1 className="text-3xl font-display font-bold tracking-tight">Worker Dashboard</h1>
        <p className="text-muted-foreground">Find tasks, submit proofs, and earn money.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Available Balance</p>
                {isSummaryLoading ? <Skeleton className="h-10 w-24" /> : (
                  <p className="text-4xl font-mono font-bold text-foreground">${summary?.walletBalance?.toFixed(2) || '0.00'}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded bg-primary/10 text-primary flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground flex justify-between items-center">
              <span>Pending: ${summary?.pendingEarnings?.toFixed(2) || '0.00'}</span>
              <Link href="/worker/earnings" className="text-primary hover:underline">Withdraw</Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Reputation Score</p>
                {isSummaryLoading ? <Skeleton className="h-10 w-24" /> : (
                  <div className="flex items-center gap-3">
                    <p className="text-4xl font-mono font-bold">{summary?.reputationScore || 0}</p>
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${getReputationColor(summary?.reputationLevel)}`}>
                      {summary?.reputationLevel || 'Newcomer'}
                    </span>
                  </div>
                )}
              </div>
              <div className="w-10 h-10 rounded bg-chart-4/10 text-chart-4 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Validation Rate: {summary?.validationRate || 0}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tasks Completed</p>
                {isSummaryLoading ? <Skeleton className="h-10 w-24" /> : (
                  <p className="text-4xl font-mono font-bold">{summary?.tasksCompleted || 0}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded bg-chart-2/10 text-chart-2 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              {summary?.tasksAvailable || 0} tasks available now
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-primary" /> Available Tasks
              </h2>
              <p className="text-sm text-muted-foreground">Quick hits matching your profile</p>
            </div>
            <Link href="/worker/tasks" className="text-sm text-primary hover:underline font-medium">View all</Link>
          </div>

          {isTasksLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : tasks?.items?.length === 0 ? (
            <Card className="bg-muted/30 border-dashed"><CardContent className="p-8 text-center text-muted-foreground">No tasks available right now. Check back later.</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {tasks?.items?.map(task => (
                <Link key={task.id} href={`/worker/tasks/${task.id}`}>
                  <Card className="hover-elevate cursor-pointer group transition-all duration-200">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
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
                        <div className="font-mono font-bold text-lg text-primary">${task.reward.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground flex items-center justify-end gap-1 group-hover:text-primary transition-colors">
                          Claim <ChevronRight className="w-3 h-3" />
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
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-muted-foreground" /> Recent Activity
          </h2>
          <Card>
            <CardContent className="p-0">
              {isActivityLoading ? (
                <div className="p-4 space-y-4"><Skeleton className="h-8 w-full"/><Skeleton className="h-8 w-full"/></div>
              ) : activity?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No recent activity</div>
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
