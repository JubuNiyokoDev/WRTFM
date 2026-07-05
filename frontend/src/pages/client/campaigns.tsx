import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useListCampaigns, useCreateCampaign } from '@/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Filter, Megaphone, Play, Pause, CheckCircle2, CircleStop, BarChart3 } from 'lucide-react';
import { Link } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { getListCampaignsQueryKey } from '@/api-client';
import { AppIllustration } from '@/components/illustrations';
import { CardListSkeleton } from '@/components/ui/loading-states';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  taskType: z.string(),
  platform: z.string(),
  targetUrl: z.string().url().or(z.literal('')).optional(),
  budget: z.coerce.number().min(10),
  rewardPerTask: z.coerce.number().min(0.01),
  workersNeeded: z.coerce.number().min(1),
  instructions: z.string().min(10),
});

export default function ClientCampaigns() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useListCampaigns({ 
    status: statusFilter !== 'all' ? statusFilter as any : undefined 
  });
  
  const createMutation = useCreateCampaign();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      taskType: 'instagram_like',
      platform: 'instagram',
      targetUrl: '',
      budget: 100,
      rewardPerTask: 0.1,
      workersNeeded: 1000,
      instructions: 'Please like the post and provide your username.',
    },
  });

  const selectedPlatform = form.watch('platform');

  const platformActions: Record<string, { value: string; labelKey: string }[]> = {
    instagram: [
      { value: 'instagram_like', labelKey: 'client.campaigns.action.like' },
      { value: 'instagram_follow', labelKey: 'client.campaigns.action.follow' },
      { value: 'instagram_comment', labelKey: 'client.campaigns.action.comment' },
    ],
    youtube: [
      { value: 'youtube_watch', labelKey: 'client.campaigns.action.watch' },
      { value: 'youtube_like', labelKey: 'client.campaigns.action.like' },
      { value: 'youtube_comment', labelKey: 'client.campaigns.action.comment' },
      { value: 'youtube_subscribe', labelKey: 'client.campaigns.action.subscribe' },
    ],
    tiktok: [
      { value: 'tiktok_like', labelKey: 'client.campaigns.action.like' },
      { value: 'tiktok_follow', labelKey: 'client.campaigns.action.follow' },
      { value: 'tiktok_comment', labelKey: 'client.campaigns.action.comment' },
    ],
    twitter: [
      { value: 'twitter_like', labelKey: 'client.campaigns.action.like' },
      { value: 'twitter_follow', labelKey: 'client.campaigns.action.follow' },
      { value: 'twitter_retweet', labelKey: 'client.campaigns.action.retweet' },
    ],
    website: [
      { value: 'website_visit', labelKey: 'client.campaigns.action.visit' },
      { value: 'website_signup', labelKey: 'client.campaigns.action.signup' },
    ],
    app: [
      { value: 'app_install', labelKey: 'client.campaigns.action.install' },
      { value: 'app_test', labelKey: 'client.campaigns.action.test' },
    ],
    other: [
      { value: 'form_fill', labelKey: 'client.campaigns.action.form_fill' },
      { value: 'content_review', labelKey: 'client.campaigns.action.content_review' },
      { value: 'data_collection', labelKey: 'client.campaigns.action.data_collection' },
    ],
  };

  const availableActions = platformActions[selectedPlatform] || [];

  useEffect(() => {
    if (availableActions.length > 0) {
      const currentAction = form.getValues('taskType');
      const isValid = availableActions.some(a => a.value === currentAction);
      if (!isValid) {
        form.setValue('taskType', availableActions[0].value);
      }
    }
  }, [selectedPlatform, availableActions]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const payload = {
      ...values,
      targetUrl: values.targetUrl || undefined,
    };
    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        toast({
          title: t('client.campaigns.created_success_title') ?? 'Campaign deployed',
          description: t('client.campaigns.created_success_desc') ?? 'Your campaign was deployed successfully.',
        });
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

  const filteredCampaigns = data?.items?.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) || 
    c.platform.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="mobile-stack">
        <div>
          <h1 className="page-title">{t('nav.campaigns')}</h1>
          <p className="page-subtitle">{t('client.campaigns.subtitle')}</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> {t('client.campaigns.new')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('client.campaigns.create_title')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <AppIllustration kind="campaign" className="mx-auto max-w-[180px]" fit="contain" />
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>{t('client.campaigns.title_label')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>{t('client.campaigns.description_label')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="platform" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('general.platform')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder={t('general.platform')} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="twitter">Twitter</SelectItem>
                          <SelectItem value="website">Website</SelectItem>
                          <SelectItem value="app">App</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="taskType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('general.actions')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder={t('client.campaigns.select_action')} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {availableActions.map((action) => (
                            <SelectItem key={action.value} value={action.value}>
                              {t(action.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="targetUrl" render={({ field }) => (
                  <FormItem><FormLabel>{t('client.campaigns.target_url')}</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="my-4 grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-3">
                  <FormField control={form.control} name="budget" render={({ field }) => (
                    <FormItem><FormLabel>{t('client.campaigns.total_budget')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="rewardPerTask" render={({ field }) => (
                    <FormItem><FormLabel>{t('client.campaigns.reward_task')}</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="workersNeeded" render={({ field }) => (
                    <FormItem><FormLabel>{t('client.campaigns.target_workers')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="instructions" render={({ field }) => (
                  <FormItem><FormLabel>{t('client.campaigns.instructions')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? t('general.loading') : t('client.campaigns.deploy')}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
        <div className="flex w-full items-center gap-2 pr-2 sm:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground" />
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

      {isLoading ? (
        <CardListSkeleton count={4} media />
      ) : filteredCampaigns?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-lg border border-border border-dashed">
          <AppIllustration kind="empty" className="mx-auto mb-3 max-w-[180px]" />
          <h3 className="text-lg font-medium mb-1">{t('client.campaigns.no_campaigns')}</h3>
          <p className="text-muted-foreground text-sm">{t('client.campaigns.no_campaigns_desc')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCampaigns?.map((campaign) => (
            <Link key={campaign.id} href={`/client/campaigns/${campaign.id}`}>
              <Card className="hover-elevate cursor-pointer group transition-all duration-200">
                <CardContent className="flex flex-col gap-5 p-4 sm:p-5 md:flex-row md:items-center">
                  
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">{campaign.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase tracking-wide">
                            {campaign.platform}
                          </span>
                          <span className="text-sm text-muted-foreground">{campaign.taskType.replace('_', ' ')}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted">
                        {campaign.status === 'active' && <Play className="w-3.5 h-3.5 text-primary fill-primary" />}
                        {campaign.status === 'paused' && <Pause className="w-3.5 h-3.5 text-chart-4 fill-chart-4" />}
                        {campaign.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-chart-2" />}
                        {campaign.status === 'cancelled' && <CircleStop className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="capitalize">{campaign.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 md:w-auto md:border-l md:border-t-0 md:pl-6 md:pt-0">
                    <div className="space-y-1 text-center md:text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{t('general.progress')}</div>
                      <div className="font-mono font-medium">
                        {campaign.workersCompleted} <span className="text-muted-foreground">/ {campaign.workersNeeded}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-center md:text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{t('general.spent')}</div>
                      <div className="font-mono font-medium">
                        ${campaign.spent} <span className="text-muted-foreground">/ ${campaign.budget}</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-center md:text-right hidden sm:block">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{t('general.auto_rate')}</div>
                      <div className={`font-mono font-medium flex items-center justify-end gap-1 ${campaign.automationRate && campaign.automationRate > 90 ? 'text-primary' : ''}`}>
                        {campaign.automationRate || 0}%
                      </div>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
