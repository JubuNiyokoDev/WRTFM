import React, { useState } from 'react';
import { useGetMe, useUpdateUser, getGetMeQueryKey } from '@/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { User, Mail, Globe, Shield, Calendar, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

import { Label } from '@/components/ui/label';
import { KycModal } from '@/components/kyc-modal';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  country: z.string().optional(),
});

export default function ClientProfile() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useGetMe();
  const updateMutation = useUpdateUser();
  const [kycOpen, setKycOpen] = useState(false);

  // Calculate Progress
  let profileProgress = 20;
  if (me?.name && me.name.length >= 2) profileProgress += 20;
  if (me?.country) profileProgress += 20;
  if (me?.kycStatus === 'verified') profileProgress += 40;
  else if (me?.kycStatus === 'pending') profileProgress += 20;

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      country: '',
    },
  });

  React.useEffect(() => {
    if (me) {
      form.reset({
        name: me.name ?? '',
        country: me.country ?? '',
      });
    }
  }, [me, form]);

  const onSubmit = (values: z.infer<typeof profileSchema>) => {
    if (!me) return;
    updateMutation.mutate({ id: me.id, data: values }, {
      onSuccess: () => {
        toast({ title: t('general.success') ?? 'Success', description: t('profile.updated') ?? 'Profile updated.' });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
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

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      return format(d, 'MMM d, yyyy');
    } catch (e) {
      console.error("Date formatting error:", e);
      return '-';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t('profile.title')}</h1>
        <p className="page-subtitle">{t('profile.subtitle')}</p>
      </div>

      {/* User Info Card */}
      <Card className="relative overflow-hidden">
        <div className="absolute right-0 top-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <CardContent className="relative z-10 p-4 sm:p-5">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary sm:h-16 sm:w-16 sm:text-xl">
              {me?.name ? me.name.slice(0, 2).toUpperCase() : ''}
            </div>
            <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
              <div className="min-w-0">
                <h2 className="truncate text-base font-display font-bold sm:text-lg">{me?.name}</h2>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">{me?.email}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary capitalize sm:text-xs">
                  <Shield className="h-3 w-3 shrink-0" /> <span className="truncate">{t(`role.${me?.role}`)}</span>
                </span>
                {me?.country && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
                    <Globe className="h-3 w-3 shrink-0" /> <span className="truncate">{me.country}</span>
                  </span>
                )}
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
                  <Calendar className="h-3 w-3 shrink-0" /> <span className="truncate">{formatDate(me?.createdAt)}</span>
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KYC Progress Card */}
      <Card className="border-border overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
                    <ShieldCheck className={`h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${me?.kycStatus === 'verified' ? 'text-green-500' : 'text-primary'}`} />
                    Complétion du Profil
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                    {me?.kycStatus === 'verified' 
                      ? 'Votre identité est vérifiée. Vous avez accès à toutes les fonctionnalités.' 
                      : 'Complétez votre profil et vérifiez votre identité pour débloquer les retraits.'}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-muted px-2 py-1 font-mono text-sm font-bold tabular-nums sm:text-xl">{profileProgress}%</span>
              </div>
              
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div 
                  className={`h-full transition-all duration-1000 ease-out rounded-full ${me?.kycStatus === 'verified' ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${profileProgress}%` }}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-[11px] font-medium sm:flex sm:gap-4 sm:text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-green-500">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Compte créé</span>
                </span>
                <span className={`flex min-w-0 items-center gap-1.5 ${me?.name && me.country ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {me?.name && me.country ? <CheckCircle2 className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border border-current opacity-50" />}
                  <span className="truncate">Infos complétées</span>
                </span>
                <span className={`flex min-w-0 items-center gap-1.5 ${me?.kycStatus === 'verified' ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {me?.kycStatus === 'verified' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border border-current opacity-50" />}
                  <span className="truncate">KYC Vérifié</span>
                </span>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center border-border sm:min-w-[160px] sm:border-l sm:pl-5">
              {me?.kycStatus === 'verified' ? (
                <div className="flex flex-col items-center text-green-500">
                  <CheckCircle2 className="mb-1 h-8 w-8 sm:h-10 sm:w-10" />
                  <span className="text-xs font-semibold uppercase tracking-normal sm:text-sm">Vérifié</span>
                </div>
              ) : (
                <Button className="w-full gap-2 group" onClick={() => setKycOpen(true)}>
                  Vérifier mon identité <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <KycModal 
        open={kycOpen} 
        onOpenChange={setKycOpen} 
        userName={me?.name || 'Utilisateur'} 
      />

      {/* Edit Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> {t('profile.edit')}</CardTitle>
          <CardDescription>{t('profile.edit_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('profile.name')}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <Label>{t('profile.email')}</Label>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {me?.email}
                </div>
                <p className="text-xs text-muted-foreground">{t('profile.email_locked')}</p>
              </div>

              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('profile.country')}</FormLabel>
                  <FormControl><Input placeholder="US, FR, UK..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="pt-2">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t('general.loading') : t('general.save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
