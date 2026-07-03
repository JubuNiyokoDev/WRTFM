import { useState } from 'react';
import { useListCampaigns } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Database, Play, Pause, CheckCircle2, CircleStop } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function AdminCampaigns() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useListCampaigns({ 
    status: statusFilter !== 'all' ? statusFilter as any : undefined,
    limit: 50
  });

  const filteredCampaigns = data?.items?.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) || 
    c.clientId.toString().includes(search)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">All Campaigns</h1>
        <p className="text-muted-foreground">Global view of all client campaigns across the platform.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-2 rounded-lg border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search title or client ID..." 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 pr-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4"><Skeleton className="h-12 w-full"/><Skeleton className="h-12 w-full"/></div>
          ) : filteredCampaigns?.length === 0 ? (
             <div className="text-center py-16 text-muted-foreground">
               <Database className="w-12 h-12 mx-auto mb-4 text-muted" />
               <p className="text-lg font-medium text-foreground">No campaigns found</p>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/30">
                    <th className="px-6 py-4 font-medium text-muted-foreground">Campaign</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Client ID</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Progress</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Auto Rate</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCampaigns?.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground truncate max-w-[200px]">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{c.platform} • {c.taskType}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">
                        #{c.clientId}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          {c.status === 'active' && <Play className="w-3 h-3 text-primary fill-primary" />}
                          {c.status === 'paused' && <Pause className="w-3 h-3 text-chart-4 fill-chart-4" />}
                          {c.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-chart-2" />}
                          {c.status === 'cancelled' && <CircleStop className="w-3 h-3 text-muted-foreground" />}
                          <span className="capitalize">{c.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">
                        {c.workersCompleted}/{c.workersNeeded}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-mono font-medium ${c.automationRate && c.automationRate > 90 ? 'text-primary' : 'text-muted-foreground'}`}>
                          {c.automationRate || 0}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(c.createdAt), 'MMM d')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
