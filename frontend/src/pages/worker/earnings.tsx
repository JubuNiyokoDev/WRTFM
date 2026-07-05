import { getMyReputation, useGetWallet, useListTransactions, useWithdrawFunds, getGetWalletQueryKey, useGetMe } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CardListSkeleton, MetricGridSkeleton } from '@/components/ui/loading-states';
import { format } from 'date-fns';
import { Wallet, ArrowDownRight, ArrowUpRight, Award, ShieldCheck, CheckCircle2, History } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { KycModal } from '@/components/kyc-modal';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

const withdrawSchema = z.object({
  amount: z.coerce.number().min(5, "Minimum withdrawal is $5"),
  method: z.string().min(1, "Method is required"),
  accountDetails: z.string().min(5, "Account details required"),
});

export default function WorkerEarnings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);

  const { data: me } = useGetMe();
  const { data: wallet, isLoading: isWalletLoading } = useGetWallet();
  const { data: transactions, isLoading: isTxLoading } = useListTransactions({ limit: 20 });
  const { data: reputation, isLoading: isRepLoading } = useQuery({
    queryKey: ['users', 'me', 'reputation'],
    queryFn: getMyReputation,
  });

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
        toast({ title: t('worker.withdraw_requested'), description: t('worker.withdraw_desc') });
        queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      },
      onError: (err: any) => {
        const errorMessage = err?.data?.error || err?.message || 'An error occurred';
        toast({
          variant: 'destructive',
          title: t('general.error') ?? 'Error',
          description: errorMessage,
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('worker.earnings.title')}</h1>
        <p className="page-subtitle">{t('worker.earnings.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <CardContent className="relative z-10 p-3.5 sm:p-4">
            <div className="mb-4 flex items-start justify-between sm:mb-6">
              <div>
                <p className="text-sm font-medium text-primary uppercase tracking-wider mb-1">{t('worker.balance')}</p>
                {isWalletLoading ? <Skeleton className="h-7 w-32 rounded-md" /> : (
                  <p className="metric-value text-foreground">${wallet?.balance?.toFixed(2) || '0.00'}</p>
                )}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm sm:h-10 sm:w-10">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>

            <div className="mb-5 flex flex-col gap-2 text-sm sm:mb-7 sm:flex-row sm:items-center sm:gap-4">
              <div className="text-muted-foreground">
                {t('worker.pending')}: <span className="font-mono text-foreground font-medium">${wallet?.pendingBalance?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="text-muted-foreground">
                {t('general.lifetime')}: <span className="font-mono text-foreground font-medium">${wallet?.totalEarned?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <>
              <Button 
                className="w-full sm:w-auto" 
                disabled={!wallet?.balance || wallet.balance < 5}
                onClick={() => {
                  if (me?.kycStatus !== 'verified') {
                    setKycOpen(true);
                  } else {
                    setWithdrawOpen(true);
                  }
                }}
              >
                {t('worker.withdraw')}
              </Button>
              
              <KycModal 
                open={kycOpen} 
                onOpenChange={setKycOpen} 
                userName={me?.name || 'Utilisateur'} 
                onSuccess={() => setWithdrawOpen(true)}
              />

              <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('worker.withdraw_request')}</DialogTitle>
                </DialogHeader>
                <AppIllustration kind="wallet" className="mx-auto max-w-[170px]" />
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onWithdraw)} className="space-y-4 pt-4">
                    <FormField control={form.control} name="amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('general.amount')} ($)</FormLabel>
                        <FormControl><Input type="number" step="0.01" max={wallet?.balance} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="method" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('worker.method')}</FormLabel>
                        <FormControl><Input placeholder={t('worker.method_placeholder')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="accountDetails" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('worker.account_details')}</FormLabel>
                        <FormControl><Input placeholder="email@example.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full mt-4" disabled={withdrawMutation.isPending}>
                      {withdrawMutation.isPending ? t('general.processing') : t('worker.confirm_withdraw')}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            </>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="h-4 w-4 sm:h-5 sm:w-5" /> {t('worker.reputation_standing')}</CardTitle>
            <CardDescription>{t('worker.reputation_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isRepLoading ? <MetricGridSkeleton count={2} /> : (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3.5 sm:p-4">
                  <div>
                    <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">{t('worker.current_level')}</div>
                    <div className="text-base font-display font-bold capitalize text-primary sm:text-lg">{reputation?.level || 'Newcomer'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">{t('worker.reputation_score')}</div>
                    <div className="metric-value">{reputation?.score || 0}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <ShieldCheck className="w-4 h-4" /> {t('worker.validation_rate')}
                    </div>
                    <div className="text-lg font-mono font-medium">{reputation?.validationRate || 0}%</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <CheckCircle2 className="w-4 h-4" /> {t('worker.quality_score')}
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
          <CardTitle className="flex items-center gap-2"><History className="h-4 w-4 sm:h-5 sm:w-5" /> {t('worker.transaction_history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isTxLoading ? (
            <CardListSkeleton count={5} />
          ) : transactions?.items?.length === 0 ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-muted-foreground">
              <AppIllustration kind="empty" className="max-w-[170px]" />
              {t('worker.no_transactions')}
            </div>
          ) : (
            <div className="responsive-table">
               <table className="w-full text-sm">
                 <thead>
                   <tr className="border-b border-border text-left text-muted-foreground">
                     <th className="pb-3 font-medium">{t('general.type')}</th>
                     <th className="pb-3 font-medium">{t('general.description')}</th>
                     <th className="pb-3 font-medium">{t('general.status')}</th>
                     <th className="pb-3 font-medium">{t('general.date')}</th>
                     <th className="pb-3 font-medium text-right">{t('general.amount')}</th>
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
