import { useState } from 'react';
import { useListUsers, useUpdateUser, getListUsersQueryKey } from '@/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableRowsSkeleton } from '@/components/ui/loading-states';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Search, UserX, UserCheck, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useListUsers({ 
    role: roleFilter !== 'all' ? roleFilter as any : undefined,
    limit: 50
  });

  const updateMutation = useUpdateUser();

  const handleToggleActive = (id: number, currentActive: boolean) => {
    updateMutation.mutate({ id, data: { isActive: !currentActive } }, {
      onSuccess: () => {
        toast({ title: t('admin.users.updated'), description: t('admin.users.updated_desc') });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: t('general.error'),
          description: error?.data?.error || error.message || t('general.error'),
          variant: 'destructive',
        });
      }
    });
  };

  const filteredUsers = data?.items?.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('admin.users.title')}</h1>
        <p className="page-subtitle">{t('admin.users.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder={t('general.search_users')} 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 pr-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full border-none bg-transparent shadow-none sm:w-[150px]">
              <SelectValue placeholder={t('general.role')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('general.all_roles')}</SelectItem>
              <SelectItem value="client">{t('role.client')}</SelectItem>
              <SelectItem value="worker">{t('role.worker')}</SelectItem>
              <SelectItem value="admin">{t('role.admin')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableRowsSkeleton rows={6} columns={6} />
          ) : (
            <div className="responsive-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/30">
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('admin.users.user')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.role')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('admin.users.reputation')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('admin.users.joined')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('general.status')}</th>
                    <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-right text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers?.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                          user.role === 'admin' ? 'bg-primary/10 text-primary' :
                          user.role === 'client' ? 'bg-chart-2/10 text-chart-2' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {t(`role.${user.role}`)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-mono font-medium">
                        {user.role === 'worker' ? user.reputationScore || 0 : '-'}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">
                        {format(new Date(user.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${user.isActive ? 'text-chart-2' : 'text-destructive'}`}>
                          <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-chart-2' : 'bg-destructive'}`} />
                          {user.isActive ? t('admin.users.active') : t('admin.users.suspended')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggleActive(user.id, user.isActive || false)}>
                              {user.isActive ? <><UserX className="w-4 h-4 mr-2" /> {t('admin.users.suspend')}</> : <><UserCheck className="w-4 h-4 mr-2" /> {t('admin.users.activate')}</>}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
