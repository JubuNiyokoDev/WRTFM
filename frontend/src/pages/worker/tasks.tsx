import { useState } from 'react';
import { useListAvailableTasks } from '@/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';
import { CardListSkeleton } from '@/components/ui/loading-states';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

export default function WorkerTasks() {
  const { t } = useTranslation();
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useListAvailableTasks({
    platform: platformFilter !== 'all' ? platformFilter : undefined
  });

  const filteredTasks = data?.items?.filter(t => 
    t.title.toLowerCase().includes(search.toLowerCase()) || 
    t.taskType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('worker.tasks.title')}</h1>
        <p className="page-subtitle">{t('worker.tasks.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder={t('general.search_tasks')} 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex w-full items-center gap-2 pr-2 sm:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-full border-none bg-transparent shadow-none sm:w-[150px]">
              <SelectValue placeholder={t('general.platform')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('general.all_platforms')}</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="twitter">Twitter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardListSkeleton count={4} media />
        </div>
      ) : filteredTasks?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-lg border border-border border-dashed">
          <AppIllustration kind="empty" className="mx-auto mb-3 max-w-[180px]" />
          <div className="text-muted-foreground mb-2 text-lg">{t('worker.tasks.no_found')}</div>
          <p className="text-sm text-muted-foreground">{t('worker.no_tasks_now')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredTasks?.map(task => (
            <Link key={task.id} href={`/worker/tasks/${task.id}`}>
              <Card className="hover-elevate cursor-pointer group h-full flex flex-col transition-all duration-200">
                <CardContent className="flex h-full flex-col p-3.5 sm:p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-muted text-xs font-bold uppercase text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary sm:h-10 sm:w-10">
                        {task.platform.substring(0, 2)}
                      </div>
                      <div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase tracking-wide">
                          {task.platform}
                        </span>
                        <div className="text-sm font-medium mt-1 text-muted-foreground capitalize">{task.taskType.replace('_', ' ')}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-base font-bold text-primary sm:text-lg">${task.reward.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <h3 className="mb-2 line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                    {task.title}
                  </h3>
                  
                  <div className="mt-auto pt-4 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {task.estimatedMinutes && <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {task.estimatedMinutes}m est.</span>}
                    </div>
                    <div className="flex items-center gap-1 font-medium group-hover:text-primary transition-colors">
                      {t('worker.claim')} <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
