import { useGetWallet, useListTransactions, useGetUserReputation, useWithdrawFunds, getGetWalletQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Wallet, ArrowDownRight, ArrowUpRight, Award, ShieldCheck, CheckCircle2, History } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';

const withdrawSchema = z.object({
  amount: z.coerce.number().min(5, "Minimum withdrawal is $5"),
  method: z.string().min(1, "Method is required"),
  accountDetails: z.string().min(5, "Account details required"),
});

export default function WorkerEarnings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const { data: wallet, isLoading: isWalletLoading } = useGetWallet();
  const { data: transactions, isLoading: isTxLoading } = useListTransactions({ limit: 20 });
  const { data: reputation, isLoading: isRepLoading } = useGetUserReputation(1); // Demo using ID 1, API should probably imply 'me' but schema needs ID

  const withdrawMutation = useWithdrawFunds();

  const form = useForm<z.infer<typeof withdrawSchema>>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: {
      amount: 10,
      method: 'paypal',
      accountDetails: '',
    },
  });

  const onWithdraw = (values: z.infer<typeof withdrawSchema>) => {
    withdrawMutation.mutate({ data: values }, {
      onSuccess: () => {
        setWithdrawOpen(false);
        form.reset();
        toast({ title: "Withdrawal Requested", description: "Funds will be processed shortly." });
        queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Earnings & Reputation</h1>
        <p className="text-muted-foreground">Manage your funds and view your standing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <CardContent className="p-8 relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-sm font-medium text-primary uppercase tracking-wider mb-1">Available Balance</p>
                {isWalletLoading ? <Skeleton className="h-12 w-32" /> : (
                  <p className="text-5xl font-mono font-bold text-foreground">${wallet?.balance?.toFixed(2) || '0.00'}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <Wallet className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm mb-8">
              <div className="text-muted-foreground">
                Pending: <span className="font-mono text-foreground font-medium">${wallet?.pendingBalance?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="text-muted-foreground">
                Lifetime: <span className="font-mono text-foreground font-medium">${wallet?.totalEarned?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="w-full sm:w-auto" disabled={!wallet?.balance || wallet.balance < 5}>
                  Withdraw Funds
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Withdrawal</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onWithdraw)} className="space-y-4 pt-4">
                    <FormField control={form.control} name="amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount ($)</FormLabel>
                        <FormControl><Input type="number" step="0.01" max={wallet?.balance} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="method" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Method</FormLabel>
                        <FormControl><Input placeholder="PayPal, Bank Transfer..." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="accountDetails" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Email / Details</FormLabel>
                        <FormControl><Input placeholder="email@example.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full mt-4" disabled={withdrawMutation.isPending}>
                      {withdrawMutation.isPending ? "Processing..." : "Confirm Withdrawal"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="w-5 h-5" /> Reputation Standing</CardTitle>
            <CardDescription>Higher reputation unlocks higher paying tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {isRepLoading ? <div className="space-y-4"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/></div> : (
              <div className="space-y-6">
                <div className="flex justify-between items-center p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Current Level</div>
                    <div className="text-2xl font-display font-bold capitalize text-primary">{reputation?.level || 'Newcomer'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Score</div>
                    <div className="text-3xl font-mono font-bold">{reputation?.score || 0}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <ShieldCheck className="w-4 h-4" /> Validation Rate
                    </div>
                    <div className="text-lg font-mono font-medium">{reputation?.validationRate || 0}%</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <CheckCircle2 className="w-4 h-4" /> Quality Score
                    </div>
                    <div className="text-lg font-mono font-medium">{(reputation?.avgProofQuality || 0).toFixed(1)}/10</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {isTxLoading ? (
            <div className="space-y-4"><Skeleton className="h-12 w-full"/><Skeleton className="h-12 w-full"/></div>
          ) : transactions?.items?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto">
               <table className="w-full text-sm">
                 <thead>
                   <tr className="border-b border-border text-left text-muted-foreground">
                     <th className="pb-3 font-medium">Type</th>
                     <th className="pb-3 font-medium">Description</th>
                     <th className="pb-3 font-medium">Status</th>
                     <th className="pb-3 font-medium">Date</th>
                     <th className="pb-3 font-medium text-right">Amount</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                   {transactions?.items?.map((tx) => (
                     <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                       <td className="py-3">
                         <div className="flex items-center gap-2">
                           {tx.type === 'withdrawal' ? (
                             <div className="w-6 h-6 rounded bg-chart-4/10 text-chart-4 flex items-center justify-center"><ArrowUpRight className="w-3 h-3" /></div>
                           ) : (
                             <div className="w-6 h-6 rounded bg-chart-2/10 text-chart-2 flex items-center justify-center"><ArrowDownRight className="w-3 h-3" /></div>
                           )}
                           <span className="capitalize">{tx.type.replace('_', ' ')}</span>
                         </div>
                       </td>
                       <td className="py-3 text-muted-foreground">{tx.description}</td>
                       <td className="py-3">
                         <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                           tx.status === 'completed' ? 'bg-chart-2/10 text-chart-2' : 
                           tx.status === 'pending' ? 'bg-chart-4/10 text-chart-4' : 
                           'bg-muted text-muted-foreground'
                         }`}>
                           {tx.status}
                         </span>
                       </td>
                       <td className="py-3 text-muted-foreground">{format(new Date(tx.createdAt), 'MMM d, yyyy')}</td>
                       <td className={`py-3 text-right font-mono font-medium ${tx.type === 'withdrawal' ? 'text-foreground' : 'text-primary'}`}>
                         {tx.type === 'withdrawal' ? '-' : '+'}${tx.amount.toFixed(2)}
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
