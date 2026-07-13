import { useState } from 'react';
import { useListAssignments, Assignment } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslation } from '@/hooks/use-translation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ListChecks } from 'lucide-react';

const statusStyles: Record<string, string> = {
  in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  submitted: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  correction_requested: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

const statusTranslations: Record<string, string> = {
  in_progress: 'En cours',
  submitted: 'Soumis',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  correction_requested: 'Correction demandée',
};

function AssignmentsTable({ assignments }: { assignments: Assignment[] }) {
    const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('history.task_title')}</TableHead>
          <TableHead>{t('history.status')}</TableHead>
          <TableHead>{t('history.date')}</TableHead>
          <TableHead className="text-right">{t('general.reward')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => (
          <TableRow key={assignment.id}>
            <TableCell className="font-medium">{assignment.task?.title || 'N/A'}</TableCell>
            <TableCell>
              <Badge variant="outline" className={statusStyles[assignment.status] || ''}>
                {statusTranslations[assignment.status] || assignment.status}
              </Badge>
            </TableCell>
            <TableCell>{format(new Date(assignment.createdAt), 'd MMM yyyy', { locale: fr })}</TableCell>
            <TableCell className="text-right font-mono">${assignment.reward?.toFixed(2) || '0.00'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function WorkerHistory() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'in_progress' | 'submitted' | 'approved' | 'rejected' | undefined>(undefined);

  const { data, isLoading } = useListAssignments({ status, page, limit: 10 });

  const handleTabChange = (newStatus: string) => {
    setStatus(newStatus === 'all' ? undefined : newStatus as any);
    setPage(1);
  };

  const assignments = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('history.title')}</h1>
        <p className="page-subtitle">{t('history.subtitle')}</p>
      </div>
      <Card>
        <CardHeader>
          <Tabs onValueChange={handleTabChange} defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">{t('history.all')}</TabsTrigger>
              <TabsTrigger value="in_progress">{statusTranslations['in_progress']}</TabsTrigger>
              <TabsTrigger value="submitted">{statusTranslations['submitted']}</TabsTrigger>
              <TabsTrigger value="approved">{statusTranslations['approved']}</TabsTrigger>
              <TabsTrigger value="rejected">{statusTranslations['rejected']}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading && <p>Loading...</p>}
          {!isLoading && assignments.length === 0 && (
            <Alert>
                <ListChecks className="h-4 w-4" />
                <AlertTitle>{t('history.no_tasks')}</AlertTitle>
                <AlertDescription>
                    {t('history.no_tasks_desc')}
                </AlertDescription>
            </Alert>
          )}
          {!isLoading && assignments.length > 0 && (
            <>
              <AssignmentsTable assignments={assignments} />
              <div className="flex items-center justify-between mt-4">
                <Button variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                  {t('pagination.previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                  {t('pagination.next')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
