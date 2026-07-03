import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useListCampaigns, useCreateCampaign } from '@workspace/api-client-react';
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
import { getListCampaignsQueryKey } from '@workspace/api-client-react';

const formSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  taskType: z.string(),
  platform: z.string(),
  targetUrl: z.string().url().optional(),
  budget: z.coerce.number().min(10),
  rewardPerTask: z.coerce.number().min(0.01),
  workersNeeded: z.coerce.number().min(1),
  instructions: z.string().min(10),
});

export default function ClientCampaigns() {
  const { t } = useTranslation();
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

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate({ data: values }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      }
    });
  };

  const filteredCampaigns = data?.items?.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) || 
    c.platform.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Manage your automated task batches.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Campaign Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="platform" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="twitter">Twitter</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="taskType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Action</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="instagram_like">Like</SelectItem>
                          <SelectItem value="instagram_follow">Follow</SelectItem>
                          <SelectItem value="youtube_watch">Watch</SelectItem>
                          <SelectItem value="twitter_retweet">Retweet</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="targetUrl" render={({ field }) => (
                  <FormItem><FormLabel>Target URL</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-3 gap-4 border-y border-border py-4 my-4">
                  <FormField control={form.control} name="budget" render={({ field }) => (
                    <FormItem><FormLabel>Total Budget ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="rewardPerTask" render={({ field }) => (
                    <FormItem><FormLabel>Reward/Task ($)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="workersNeeded" render={({ field }) => (
                    <FormItem><FormLabel>Target Workers</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="instructions" render={({ field }) => (
                  <FormItem><FormLabel>Instructions for Workers</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Deploy Campaign'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-2 rounded-lg border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search campaigns..." 
            className="pl-9 border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 pr-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1,2,3].map(i => <Card key={i} className="h-32 bg-muted/20" />)}
        </div>
      ) : filteredCampaigns?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-lg border border-border border-dashed">
          <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-1">No campaigns found</h3>
          <p className="text-muted-foreground text-sm">Create a new campaign to start distributing tasks.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCampaigns?.map((campaign) => (
            <Link key={campaign.id} href={`/client/campaigns/${campaign.id}`}>
              <Card className="hover-elevate cursor-pointer group transition-all duration-200">
                <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-center">
                  
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

                  <div className="flex gap-8 items-center w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-border md:pl-6 md:border-l">
                    <div className="space-y-1 text-center md:text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Progress</div>
                      <div className="font-mono font-medium">
                        {campaign.workersCompleted} <span className="text-muted-foreground">/ {campaign.workersNeeded}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-center md:text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Spent</div>
                      <div className="font-mono font-medium">
                        ${campaign.spent} <span className="text-muted-foreground">/ ${campaign.budget}</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-center md:text-right hidden sm:block">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Auto Rate</div>
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
