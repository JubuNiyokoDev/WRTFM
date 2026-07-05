import { useState } from 'react';
import { useListVerifications, useReviewVerification, getListVerificationsQueryKey } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableRowsSkeleton } from '@/components/ui/loading-states';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ShieldAlert, Check, X, Eye, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

export default function AdminVerifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [selectedVerif, setSelectedVerif] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const { data, isLoading } = useListVerifications({ status: 'manual_review', limit: 20 });
  const reviewMutation = useReviewVerification();

  const handleReview = (id: number, decision: 'approved' | 'rejected') => {
    reviewMutation.mutate({ id, data: { decision, notes: reviewNotes } }, {
      onSuccess: () => {
        toast({ title: t('admin.manual.review_done'), description: t('admin.manual.review_done_desc') });
        setSelectedVerif(null);
        setReviewNotes('');
        queryClient.invalidateQueries({ queryKey: getListVerificationsQueryKey() });
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

  return (
    <div className="space-y-6">
      <div className="mobile-stack">
        <div>
          <h1 className="page-title">{t('admin.manual.title')}</h1>
          <p className="page-subtitle">{t('admin.manual.subtitle')}</p>
        </div>
        <div className="px-4 py-2 bg-chart-4/10 text-chart-4 rounded-lg flex items-center gap-2 border border-chart-4/20">
          <ShieldAlert className="w-5 h-5" />
          <span className="font-mono font-bold">{data?.total || 0}</span> {t('status.pending')}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableRowsSkeleton rows={5} columns={5} />
          ) : data?.items?.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AppIllustration kind="empty" className="mx-auto mb-3 max-w-[180px]" />
              <p className="text-lg font-medium text-foreground">{t('admin.manual.empty')}</p>
              <p>{t('home.footer.promise')}</p>
            </div>
          ) : (
            <div className="responsive-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left bg-muted/30">
                  <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">ID</th>
                  <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('admin.manual.confidence')}</th>
                  <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('admin.manual.checks_passed')}</th>
                  <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-muted-foreground">{t('admin.manual.submitted')}</th>
                  <th className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-right text-muted-foreground">{t('general.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.items?.map((v) => {
                  const checksPassed = v.checks?.filter(c => c.passed).length || 0;
                  const totalChecks = v.checks?.length || 0;
                  
                  return (
                    <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-mono">#{v.id}</td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold ${v.confidenceScore < 50 ? 'text-destructive' : 'text-chart-4'}`}>
                            {v.confidenceScore.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        {checksPassed} / {totalChecks}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">
                        {format(new Date(v.createdAt), 'MMM d, HH:mm')}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setSelectedVerif(v)}>
                            <Eye className="w-4 h-4 mr-2" /> {t('admin.manual.inspect')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedVerif} onOpenChange={(o) => !o && setSelectedVerif(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('admin.manual.inspector')}</DialogTitle>
            <DialogDescription>{t('admin.manual.inspector_desc')}</DialogDescription>
          </DialogHeader>
          
          {selectedVerif && (
            <div className="space-y-6 mt-4">
              <div className="flex gap-4 p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('admin.manual.confidence_score')}</p>
                  <p className="metric-value text-chart-4">{selectedVerif.confidenceScore.toFixed(1)}</p>
                </div>
                <div className="w-px bg-border" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('admin.manual.method_attempted')}</p>
                  <p className="text-lg font-medium capitalize">{selectedVerif.method}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 border-b border-border pb-2">{t('admin.manual.engine_checks')}</h3>
                <div className="space-y-3">
                  {selectedVerif.checks?.map((check: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      {check.passed ? (
                        <Check className="w-5 h-5 text-chart-2 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-foreground">{check.name}</p>
                        {check.details && <p className="text-muted-foreground text-xs mt-0.5">{check.details}</p>}
                      </div>
                      <div className="ml-auto font-mono text-xs text-muted-foreground">Score: {check.score}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.manual.review_notes')}</label>
                <Textarea 
                  placeholder={t('admin.manual.reason')} 
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="resize-none"
                />
              </div>

              <div className="flex gap-4 pt-4 border-t border-border">
                <Button 
                  variant="destructive" 
                  className="flex-1" 
                  disabled={reviewMutation.isPending}
                  onClick={() => handleReview(selectedVerif.id, 'rejected')}
                >
                  <X className="w-4 h-4 mr-2" /> {t('admin.manual.reject_proof')}
                </Button>
                <Button 
                  className="flex-1 bg-chart-2 hover:bg-chart-2/90 text-white" 
                  disabled={reviewMutation.isPending}
                  onClick={() => handleReview(selectedVerif.id, 'approved')}
                >
                  <Check className="w-4 h-4 mr-2" /> {t('admin.manual.approve_proof')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
