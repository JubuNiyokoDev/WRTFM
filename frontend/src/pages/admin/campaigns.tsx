import { useState } from 'react';
import { useListCampaigns } from '@/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableRowsSkeleton } from '@/components/ui/loading-states';
import { Search, Play, Pause, CheckCircle2, CircleStop } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

export default function AdminCampaigns() {
  const { t } = useTranslation();
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
        <h1 className="page-title">{t('admin.campaigns.title')}</h1>
        <p className="page-subtitle">{t('client.campaigns.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder={t('general.search_campaigns')} 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 pr-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full border-none bg-transparent shadow-none sm:w-[150px]">
              <SelectValue placeholder={t('general.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('general.all_statuses')}</SelectItem>
              <SelectItem value="active">{t('status.active')}</SelectItem>
              <SelectItem value="paused">{t('status.paused')}</SelectItem>
              <SelectItem value="completed">{t('status.completed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableRowsSkeleton rows={6} columns={6} />
          ) : filteredCampaigns?.length === 0 ? (
             <div className="text-center py-16 text-muted-foreground">
               <AppIllustration kind="empty" className="mx-auto mb-3 max-w-[180px]" />
               <p className="text-lg font-medium text-foreground">{t('admin.no_campaigns')}</p>
             </div>
          ) : (
            <div className="responsive-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/30">
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('nav.campaigns')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.client_id')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.status')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.progress')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.auto_rate')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.created')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCampaigns?.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <div className="font-medium text-foreground truncate max-w-[200px]">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{c.platform} • {c.taskType}</div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-mono text-muted-foreground">
                        #{c.clientId}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <div className="flex items-center gap-1.5">
                          {c.status === 'active' && <Play className="w-3 h-3 text-primary fill-primary" />}
                          {c.status === 'paused' && <Pause className="w-3 h-3 text-chart-4 fill-chart-4" />}
                          {c.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-chart-2" />}
                          {c.status === 'cancelled' && <CircleStop className="w-3 h-3 text-muted-foreground" />}
                          <span className="capitalize">{c.status}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-mono text-muted-foreground">
                        {c.workersCompleted}/{c.workersNeeded}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <span className={`font-mono font-medium ${c.automationRate && c.automationRate > 90 ? 'text-primary' : 'text-muted-foreground'}`}>
                          {c.automationRate || 0}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">
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
