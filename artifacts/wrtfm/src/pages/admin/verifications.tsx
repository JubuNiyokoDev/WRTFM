import { useState } from 'react';
import { useListVerifications, useReviewVerification, getListVerificationsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ShieldAlert, Check, X, Eye, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function AdminVerifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedVerif, setSelectedVerif] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const { data, isLoading } = useListVerifications({ status: 'manual_review', limit: 20 });
  const reviewMutation = useReviewVerification();

  const handleReview = (id: number, decision: 'approved' | 'rejected') => {
    reviewMutation.mutate({ id, data: { decision, notes: reviewNotes } }, {
      onSuccess: () => {
        toast({ title: `Verification ${decision}`, description: `The task has been marked as ${decision}.` });
        setSelectedVerif(null);
        setReviewNotes('');
        queryClient.invalidateQueries({ queryKey: getListVerificationsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Manual Review Queue</h1>
          <p className="text-muted-foreground">Tasks flagged by the engine requiring human resolution.</p>
        </div>
        <div className="px-4 py-2 bg-chart-4/10 text-chart-4 rounded-lg flex items-center gap-2 border border-chart-4/20">
          <ShieldAlert className="w-5 h-5" />
          <span className="font-mono font-bold">{data?.total || 0}</span> Pending
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4"><Skeleton className="h-12 w-full"/><Skeleton className="h-12 w-full"/></div>
          ) : data?.items?.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-muted" />
              <p className="text-lg font-medium text-foreground">Queue is empty</p>
              <p>The automation engine is handling all current volume.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left bg-muted/30">
                  <th className="px-6 py-4 font-medium text-muted-foreground">ID</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Confidence</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Checks Passed</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Submitted</th>
                  <th className="px-6 py-4 font-medium text-right text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.items?.map((v) => {
                  const checksPassed = v.checks?.filter(c => c.passed).length || 0;
                  const totalChecks = v.checks?.length || 0;
                  
                  return (
                    <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-mono">#{v.id}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold ${v.confidenceScore < 50 ? 'text-destructive' : 'text-chart-4'}`}>
                            {v.confidenceScore.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {checksPassed} / {totalChecks}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(v.createdAt), 'MMM d, HH:mm')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setSelectedVerif(v)}>
                            <Eye className="w-4 h-4 mr-2" /> Inspect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedVerif} onOpenChange={(o) => !o && setSelectedVerif(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Verification Inspector</DialogTitle>
            <DialogDescription>Review engine results and make a final decision.</DialogDescription>
          </DialogHeader>
          
          {selectedVerif && (
            <div className="space-y-6 mt-4">
              <div className="flex gap-4 p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Confidence Score</p>
                  <p className="text-3xl font-mono font-bold text-chart-4">{selectedVerif.confidenceScore.toFixed(1)}</p>
                </div>
                <div className="w-px bg-border" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Method Attempted</p>
                  <p className="text-lg font-medium capitalize">{selectedVerif.method}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 border-b border-border pb-2">Engine Checks</h3>
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
                <label className="text-sm font-medium">Review Notes (Optional)</label>
                <Textarea 
                  placeholder="Reason for approval/rejection..." 
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
                  <X className="w-4 h-4 mr-2" /> Reject Proof
                </Button>
                <Button 
                  className="flex-1 bg-chart-2 hover:bg-chart-2/90 text-white" 
                  disabled={reviewMutation.isPending}
                  onClick={() => handleReview(selectedVerif.id, 'approved')}
                >
                  <Check className="w-4 h-4 mr-2" /> Approve Proof
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
