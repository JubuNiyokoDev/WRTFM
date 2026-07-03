import { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useGetTask, useClaimTask, useSubmitProof, getGetTaskQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Clock, DollarSign, ExternalLink, UploadCloud, CheckCircle2, ListChecks } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const proofSchema = z.object({
  screenshotUrl: z.string().url("Must be a valid URL").optional().or(z.literal('')),
  username: z.string().min(2, "Username is required"),
  description: z.string().optional(),
});

export default function WorkerTaskDetail() {
  const { id } = useParams();
  const taskId = Number(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: task, isLoading } = useGetTask(taskId, { query: { enabled: !!taskId, queryKey: getGetTaskQueryKey(taskId) } });
  const claimMutation = useClaimTask();
  const submitMutation = useSubmitProof();

  const [hasClaimed, setHasClaimed] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<any>(null);

  const form = useForm<z.infer<typeof proofSchema>>({
    resolver: zodResolver(proofSchema),
    defaultValues: {
      screenshotUrl: '',
      username: '',
      description: '',
    },
  });

  const handleClaim = () => {
    claimMutation.mutate({ data: { taskId } }, {
      onSuccess: () => {
        setHasClaimed(true);
        toast({ title: "Task claimed", description: "You have 30 minutes to complete this task." });
      }
    });
  };

  const onSubmitProof = (values: z.infer<typeof proofSchema>) => {
    // Determine proof type based on provided fields
    const proofType = values.screenshotUrl ? 'screenshot' : 'username';
    
    submitMutation.mutate({ 
      id: taskId,
      data: { 
        proofType,
        ...values
      } 
    }, {
      onSuccess: (res) => {
        setSubmittedResult(res); // VerificationResult
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
      }
    });
  };

  if (isLoading || !task) {
    return <div className="p-8 space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-[400px] w-full" /></div>;
  }

  // If task is completed/cancelled, show static view
  const isUnavailable = task.status !== 'available' && !hasClaimed && !submittedResult;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link href="/worker/tasks" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to available tasks
      </Link>

      <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded bg-muted text-xs font-bold uppercase tracking-wider">{task.platform}</span>
            <span className="text-sm text-muted-foreground capitalize">{task.taskType.replace('_', ' ')}</span>
            {isUnavailable && <span className="px-2 py-0.5 rounded bg-chart-4/10 text-chart-4 text-xs font-bold uppercase tracking-wider ml-2">Unavailable</span>}
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{task.title}</h1>
        </div>
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-4 text-primary shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wider font-medium opacity-80">Reward</div>
            <div className="text-2xl font-mono font-bold">${task.reward.toFixed(2)}</div>
          </div>
          {task.estimatedMinutes && (
            <div className="pl-4 border-l border-primary/20">
              <div className="text-xs uppercase tracking-wider font-medium opacity-80">Est. Time</div>
              <div className="text-lg font-mono font-medium flex items-center gap-1"><Clock className="w-4 h-4" /> {task.estimatedMinutes}m</div>
            </div>
          )}
        </div>
      </div>

      {submittedResult ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary mx-auto mb-4">
              {submittedResult.status === 'auto_approved' ? <CheckCircle2 className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
            </div>
            <h2 className="text-2xl font-display font-bold">Proof Submitted!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your proof is being verified by the WRTFM engine. 
              {submittedResult.status === 'auto_approved' 
                ? " Amazing! The engine auto-approved your task. Funds have been credited." 
                : ` Confidence score: ${(submittedResult.confidenceScore || 0).toFixed(1)}. Pending final result.`}
            </p>
            <div className="pt-4">
              <Button onClick={() => setLocation('/worker/tasks')}>Find More Tasks</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="prose prose-sm dark:prose-invert">
                <p className="whitespace-pre-wrap">{task.instructions}</p>
              </div>

              {task.targetUrl && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Target Link:</p>
                  <a href={task.targetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline font-mono text-sm break-all">
                    {task.targetUrl} <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                </div>
              )}

              {task.proofRequirements && task.proofRequirements.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Required Proof:</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {task.proofRequirements.map((req, i) => <li key={i}>{req}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{hasClaimed ? "Submit Proof" : "Action Required"}</CardTitle>
              <CardDescription>
                {hasClaimed ? "Provide the requested evidence below." : "You must claim this task before executing it."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasClaimed ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ListChecks className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Ready to start?</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-xs">Claiming this task reserves it for you. You will have a limited time to complete it.</p>
                  <Button size="lg" className="w-full sm:w-auto" onClick={handleClaim} disabled={claimMutation.isPending || isUnavailable}>
                    {claimMutation.isPending ? "Claiming..." : isUnavailable ? "Task Unavailable" : "Claim Task"}
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitProof)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Platform Username</FormLabel>
                          <FormControl>
                            <Input placeholder="@johndoe" {...field} />
                          </FormControl>
                          <FormDescription>The exact username you used to perform the action.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="screenshotUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Screenshot URL (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://imgur.com/..." {...field} />
                          </FormControl>
                          <FormDescription>If requested, upload a screenshot and paste the link here.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Notes (Optional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Any issues or details..." className="resize-none" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="w-full mt-4" disabled={submitMutation.isPending}>
                      <UploadCloud className="w-4 h-4 mr-2" />
                      {submitMutation.isPending ? "Verifying..." : "Submit to Engine"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
