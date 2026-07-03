import { useState } from 'react';
import { useListAvailableTasks } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkerTasks() {
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
        <h1 className="text-3xl font-display font-bold tracking-tight">Available Tasks</h1>
        <p className="text-muted-foreground">Find tasks that match your skills and earn money.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-2 rounded-lg border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search tasks..." 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 pr-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="twitter">Twitter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : filteredTasks?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-lg border border-border border-dashed">
          <div className="text-muted-foreground mb-2 text-lg">No tasks found</div>
          <p className="text-sm text-muted-foreground">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks?.map(task => (
            <Link key={task.id} href={`/worker/tasks/${task.id}`}>
              <Card className="hover-elevate cursor-pointer group h-full flex flex-col transition-all duration-200">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground uppercase group-hover:bg-primary/10 group-hover:text-primary transition-colors">
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
                      <div className="text-xl font-mono font-bold text-primary">${task.reward.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2">
                    {task.title}
                  </h3>
                  
                  <div className="mt-auto pt-4 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {task.estimatedMinutes && <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {task.estimatedMinutes}m est.</span>}
                    </div>
                    <div className="flex items-center gap-1 font-medium group-hover:text-primary transition-colors">
                      View Task <ChevronRight className="w-4 h-4" />
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
