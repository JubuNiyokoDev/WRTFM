import { useState } from 'react';
import { useListUsers, useUpdateUser, getListUsersQueryKey } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Search, Shield, UserX, UserCheck, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
        toast({ title: "User updated", description: `User is now ${!currentActive ? 'active' : 'suspended'}.` });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
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
        <h1 className="text-3xl font-display font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Manage platform accounts and access.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-2 rounded-lg border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search name or email..." 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 pr-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="worker">Worker</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4"><Skeleton className="h-12 w-full"/><Skeleton className="h-12 w-full"/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/30">
                    <th className="px-6 py-4 font-medium text-muted-foreground">User</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Role</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Reputation</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Joined</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
                    <th className="px-6 py-4 font-medium text-right text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers?.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                          user.role === 'admin' ? 'bg-primary/10 text-primary' :
                          user.role === 'client' ? 'bg-chart-2/10 text-chart-2' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium">
                        {user.role === 'worker' ? user.reputationScore || 0 : '-'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(user.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${user.isActive ? 'text-chart-2' : 'text-destructive'}`}>
                          <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-chart-2' : 'bg-destructive'}`} />
                          {user.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggleActive(user.id, user.isActive || false)}>
                              {user.isActive ? <><UserX className="w-4 h-4 mr-2" /> Suspend User</> : <><UserCheck className="w-4 h-4 mr-2" /> Activate User</>}
                            </DropdownMenuItem>
                            {user.role !== 'admin' && (
                              <DropdownMenuItem>
                                <Shield className="w-4 h-4 mr-2" /> Make Admin
                              </DropdownMenuItem>
                            )}
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
