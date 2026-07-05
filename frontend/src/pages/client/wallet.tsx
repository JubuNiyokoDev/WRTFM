import { useState } from 'react';
import { useGetWallet, useListTransactions, useWithdrawFunds, getGetWalletQueryKey, createCryptoDeposit, useGetMe } from '@/api-client';
import type { CryptoDepositResponse } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CardListSkeleton } from '@/components/ui/loading-states';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Wallet, ArrowDownRight, ArrowUpRight, Copy, Plus, Minus, History, CreditCard, QrCode } from 'lucide-react';
import { format } from 'date-fns';
import { AppIllustration } from '@/components/illustrations';
import { KycModal } from '@/components/kyc-modal';
import QRCode from 'qrcode';

const withdrawSchema = z.object({
  amount: z.coerce.number().min(5, 'Minimum $5'),
  method: z.string().min(1, 'Method required'),
  accountDetails: z.string().min(5, 'Details required'),
});

export default function ClientWallet() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet, isLoading: walletLoading } = useGetWallet();
  const { data: transactions, isLoading: txLoading } = useListTransactions({ limit: 30 });
  const { data: me } = useGetMe();

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(50);
  const [deposit, setDeposit] = useState<CryptoDepositResponse | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const withdrawMutation = useWithdrawFunds();
  const depositMutation = useMutation({
    mutationFn: createCryptoDeposit,
    onSuccess: async (data) => {
      setDeposit(data);
      if (data.payAddress) {
        try {
          const url = await QRCode.toDataURL(data.payAddress, { width: 200, margin: 2 });
          setQrCodeUrl(url);
        } catch { /* ignore */ }
      }
    },
    onError: (error: any) => {
      toast({
        title: t('general.error'),
        description: error?.data?.error || error.message || t('general.error'),
        variant: 'destructive',
      });
    },
  });

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
        toast({ title: t('general.success') ?? 'Success', description: t('wallet.withdraw_success') ?? 'Withdrawal requested.' });
        queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      },
      onError: (err: any) => {
        toast({
          variant: 'destructive',
          title: t('general.error') ?? 'Error',
          description: err?.data?.error || err?.message || t('general.error'),
        });
      },
    });
  };

  const getTypeIcon = (type: string) => {
    if (type === 'deposit') return <ArrowDownRight className="h-4 w-4 text-chart-2" />;
    if (type === 'withdrawal') return <ArrowUpRight className="h-4 w-4 text-destructive" />;
    return <CreditCard className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return 'text-chart-2 bg-chart-2/10';
    if (status === 'pending') return 'text-chart-4 bg-chart-4/10';
    if (status === 'failed') return 'text-destructive bg-destructive/10';
    return 'text-muted-foreground bg-muted';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('wallet.title')}</h1>
        <p className="page-subtitle">{t('wallet.subtitle')}</p>
      </div>

      {/* Wallet Balance Card */}
      <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <CardContent className="relative z-10 p-5 sm:p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-primary uppercase tracking-wider mb-1">{t('wallet.available_balance')}</p>
                {walletLoading ? <Skeleton className="h-10 w-40" /> : (
                  <p className="text-3xl font-display font-bold text-foreground sm:text-4xl">
                    ${wallet?.balance?.toFixed(2) || '0.00'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="text-muted-foreground">
                  {t('wallet.pending_balance')}: <span className="font-mono text-foreground font-medium">${wallet?.pendingBalance?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="w-px h-4 bg-border hidden sm:block" />
                <div className="text-muted-foreground">
                  {t('wallet.total_earned')}: <span className="font-mono text-foreground font-medium">${wallet?.totalEarned?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="w-px h-4 bg-border hidden sm:block" />
                <div className="text-muted-foreground">
                  {t('wallet.total_spent')}: <span className="font-mono text-foreground font-medium">${wallet?.totalSpent?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              {/* Deposit Button */}
              <Dialog open={depositOpen} onOpenChange={(open) => { setDepositOpen(open); if (!open) { setDeposit(null); setQrCodeUrl(null); } }}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" /> {t('wallet.deposit')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('wallet.crypto_deposit')}</DialogTitle>
                    <DialogDescription>{t('wallet.crypto_deposit_desc')}</DialogDescription>
                  </DialogHeader>
                  {!deposit ? (
                    <div className="space-y-4">
                      <AppIllustration kind="wallet" variant="transfer" className="mx-auto max-w-[180px]" fit="contain" />
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('wallet.amount_usd')}</label>
                        <Input
                          type="number"
                          min={10}
                          step="0.01"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(Number(e.target.value))}
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={depositMutation.isPending || depositAmount < 10}
                        onClick={() => depositMutation.mutate({ amount: depositAmount, priceCurrency: 'usd' })}
                      >
                        {depositMutation.isPending ? t('general.loading') : t('wallet.create_payment')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-[16px] border border-border bg-muted/30 p-4">
                        <div className="text-muted-foreground">{t('wallet.payment_status')}</div>
                        <div className="font-mono font-semibold">{deposit.status}</div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[16px] border border-border p-4">
                          <div className="text-muted-foreground">{t('wallet.pay_amount')}</div>
                          <div className="font-mono font-semibold">{deposit.payAmount ?? '-'} {deposit.payCurrency ?? ''}</div>
                        </div>
                        <div className="rounded-[16px] border border-border p-4">
                          <div className="text-muted-foreground">{t('wallet.payment_id')}</div>
                          <div className="font-mono text-xs break-all">{deposit.paymentId ?? '-'}</div>
                        </div>
                      </div>
                      {deposit.payAddress && (
                        <div className="rounded-[16px] border border-border p-4">
                          <div className="text-muted-foreground mb-2">{t('wallet.payment_address')}</div>
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-xs break-all flex-1">{deposit.payAddress}</div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(deposit.payAddress || '');
                                toast({ title: t('general.copied') ?? 'Copied', description: t('general.address_copied') ?? 'Address copied.' });
                              }}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          {qrCodeUrl && (
                            <div className="mt-3 flex justify-center">
                              <img src={qrCodeUrl} alt="QR Code" className="rounded-lg border border-border" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* Withdraw Button */}
              <>
                <Button 
                  variant="outline" 
                  className="gap-2" 
                  disabled={!wallet?.balance || wallet.balance < 5}
                  onClick={() => {
                    if (me?.kycStatus !== 'verified') {
                      setKycOpen(true);
                    } else {
                      setWithdrawOpen(true);
                    }
                  }}
                >
                  <Minus className="h-4 w-4" /> {t('wallet.withdraw')}
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
                    <DialogTitle>{t('wallet.withdraw_request')}</DialogTitle>
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
                          <FormLabel>{t('wallet.method')}</FormLabel>
                          <FormControl><Input placeholder="PayPal, USDT, Bank..." {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="accountDetails" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('wallet.account_details')}</FormLabel>
                          <FormControl><Input placeholder="email@example.com or wallet address" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full mt-4" disabled={withdrawMutation.isPending}>
                        {withdrawMutation.isPending ? t('general.processing') : t('wallet.confirm_withdraw')}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              </>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> {t('wallet.transaction_history')}</CardTitle>
          <CardDescription>{t('wallet.transaction_history_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <CardListSkeleton count={5} />
          ) : !transactions?.items?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <AppIllustration kind="empty" className="mx-auto mb-3 max-w-[160px]" />
              <p className="text-sm">{t('wallet.no_transactions')}</p>
            </div>
          ) : (
            <div className="responsive-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t('wallet.type')}</th>
                    <th className="pb-3 font-medium text-right">{t('general.amount')}</th>
                    <th className="pb-3 font-medium">{t('general.status')}</th>
                    <th className="pb-3 font-medium">{t('wallet.description')}</th>
                    <th className="pb-3 font-medium text-right">{t('general.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.items.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(tx.type)}
                          <span className="capitalize font-medium">{tx.type}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`font-mono font-medium ${tx.type === 'deposit' ? 'text-chart-2' : tx.type === 'withdrawal' ? 'text-destructive' : ''}`}>
                          {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium capitalize ${getStatusColor(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground text-xs max-w-[200px] truncate">
                        {tx.description || '-'}
                      </td>
                      <td className="py-3 text-right text-muted-foreground text-xs font-mono">
                        {format(new Date(tx.createdAt), 'MMM d, HH:mm')}
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
