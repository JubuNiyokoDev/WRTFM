import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  submitProofForm,
  useGetTask,
  useClaimTask,
  getGetTaskQueryKey,
  useListAssignments,
} from "@/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailPageSkeleton } from "@/components/ui/loading-states";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  ExternalLink,
  UploadCloud,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { AppIllustration } from "@/components/illustrations";

const proofSchema = z.object({
  username: z.string().min(2, "Username is required"),
  link: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: z.string().optional(),
});

export default function WorkerTaskDetail() {
  const { id } = useParams();
  const taskId = Number(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: task, isLoading } = useGetTask(taskId, {
    query: { enabled: !!taskId, queryKey: getGetTaskQueryKey(taskId) },
  });
  const claimMutation = useClaimTask();
  const submitMutation = useMutation({
    mutationFn: submitProofForm,
    onError: (err: any) => {
      const errorMessage =
        err?.data?.error || err?.message || "An error occurred";
      toast({
        variant: "destructive",
        title: t("general.error") ?? "Error",
        description: errorMessage,
      });
    },
  });
  const { data: assignments } = useListAssignments({ limit: 20 });

  const [hasClaimed, setHasClaimed] = useState(false);
  const [assignmentId, setAssignmentId] = useState<number | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submittedResult, setSubmittedResult] = useState<any>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);

  const [hasCorrectionRequested, setHasCorrectionRequested] = useState(false);
  const [correctionNotes, setCorrectionNotes] = useState<string | null>(null);

  const submitCorrectionMutation = useMutation({
    mutationFn: submitProofForm,
    onSuccess: () => {
      toast({
        title: t("worker.task.correction_submitted"),
        description: t("worker.task.correction_submitted_desc"),
      });
      setHasCorrectionRequested(false);
      setHasClaimed(true);
      setAssignmentStatus("in_progress");
      queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
    },
    onError: (err: any) => {
      const errorMessage =
        err?.data?.error || err?.message || "An error occurred";
      toast({
        variant: "destructive",
        title: t("general.error") ?? "Error",
        description: errorMessage,
      });
    },
  });

  const form = useForm<z.infer<typeof proofSchema>>({
    resolver: zodResolver(proofSchema),
    defaultValues: {
      username: "",
      link: "",
      description: "",
    },
  });

  const handleClaim = () => {
    claimMutation.mutate(
      { data: { taskId } },
      {
        onSuccess: (assignment) => {
          queryClient.invalidateQueries({
            queryKey: getGetTaskQueryKey(taskId),
          });
          queryClient.invalidateQueries({ queryKey: ["assignments"] });
          toast({
            title: t("worker.task.claimed_title"),
            description: t("worker.task.claimed_desc"),
          });
          try {
            setLocation(`/worker/assignment/${assignment.id}`);
          } catch (routingError) {
            // Handle routing conflict between wouter and react-router-dom
            console.error("Routing error caught:", routingError);
            // Fallback: use window.location for navigation
            window.location.href = `/worker/assignment/${assignment.id}`;
          }
        },
        onError: (err: any) => {
          const errorMessage =
            err?.data?.error || err?.message || "An error occurred";
          toast({
            variant: "destructive",
            title: t("general.error") ?? "Error",
            description: errorMessage,
          });
        },
      },
    );
  };

  const onSubmitProof = (values: z.infer<typeof proofSchema>) => {
    if (!assignmentId) {
      toast({
        title: t("general.error"),
        description: t("worker.task.claim_first"),
        variant: "destructive",
      });
      return;
    }
    if (!screenshot && !values.link) {
      toast({
        title: t("general.error"),
        description: t("worker.task.file_desc"),
        variant: "destructive",
      });
      return;
    }

    if (hasCorrectionRequested) {
      submitCorrectionMutation.mutate({
        assignmentId,
        proofType:
          screenshot && values.link
            ? "combined"
            : screenshot
              ? "screenshot"
              : "link",
        screenshot,
        username: values.username,
        link: values.link || undefined,
        description: values.description || undefined,
      });
    } else {
      submitMutation.mutate(
        {
          assignmentId,
          proofType:
            screenshot && values.link
              ? "combined"
              : screenshot
                ? "screenshot"
                : "link",
          screenshot,
          username: values.username,
          link: values.link || undefined,
          description: values.description || undefined,
        },
        {
          onSuccess: (res) => {
            setSubmittedResult(res); // VerificationResult
            queryClient.invalidateQueries({
              queryKey: getGetTaskQueryKey(taskId),
            });
            if (res.status === "manual_review") {
              const assignment = assignments?.items?.find(
                (a: any) => a.id === assignmentId,
              );
              if (assignment?.verification?.reviewNotes) {
                setCorrectionNotes(assignment.verification.reviewNotes);
                setHasCorrectionRequested(true);
              }
            }
          },
        },
      );
    }
  };

  if (isLoading || !task) {
    return <DetailPageSkeleton />;
  }

  // If task is completed/cancelled, show static view
  const isUnavailable =
    task.status !== "available" && !hasClaimed && !submittedResult;

  return (
    <div className="w-full space-y-6">
      <Link
        href="/worker/tasks"
        className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> {t("worker.task.back")}
      </Link>

      <div className="bg-card p-3.5 sm:p-4 rounded-[16px] border border-border shadow-sm flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded bg-muted text-xs font-bold uppercase tracking-wider">
              {task.platform}
            </span>
            <span className="text-sm text-muted-foreground capitalize">
              {task.taskType.replace("_", " ")}
            </span>
            {isUnavailable && (
              <span className="px-2 py-0.5 rounded bg-chart-4/10 text-chart-4 text-xs font-bold uppercase tracking-wider ml-2">
                {t("worker.task.unavailable")}
              </span>
            )}
          </div>
          <h1 className="page-title">{task.title}</h1>
        </div>
        <div className="flex w-full shrink-0 items-center gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-primary sm:w-auto sm:gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider font-medium opacity-80">
              {t("general.reward")}
            </div>
            <div className="metric-value">${task.reward.toFixed(2)}</div>
          </div>
          {task.estimatedMinutes && (
            <div className="pl-4 border-l border-primary/20">
              <div className="text-xs uppercase tracking-wider font-medium opacity-80">
                {t("worker.task.est_time")}
              </div>
              <div className="flex items-center gap-1 font-mono text-base font-medium">
                <Clock className="h-4 w-4" /> {task.estimatedMinutes}m
              </div>
            </div>
          )}
        </div>
      </div>

      {submittedResult ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="space-y-4 p-3.5 text-center sm:p-4">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary sm:h-11 sm:w-11">
              {submittedResult.status === "auto_approved" ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <Clock className="h-6 w-6" />
              )}
            </div>
            <AppIllustration
              kind="proof"
              className="mx-auto max-w-[180px]"
              fit="contain"
            />
            <h2 className="text-base font-display font-bold sm:text-lg">
              {t("worker.task.proof_submitted")}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t("worker.task.proof_review")}
              {submittedResult.status === "auto_approved"
                ? ` ${t("worker.task.auto_approved")}`
                : ` ${t("worker.task.confidence")}: ${(submittedResult.confidenceScore || 0).toFixed(1)}.`}
            </p>
            <div className="pt-4">
              <Button onClick={() => setLocation("/worker/tasks")}>
                {t("worker.task.more_tasks")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("worker.task.instructions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="prose prose-sm dark:prose-invert">
                <p className="whitespace-pre-wrap">{task.instructions}</p>
              </div>

              {task.targetUrl && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">
                    {t("worker.task.target_link")}:
                  </p>
                  <a
                    href={task.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline font-mono text-sm break-all"
                  >
                    {task.targetUrl}{" "}
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                </div>
              )}

              {task.proofRequirements && task.proofRequirements.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    {t("worker.task.required_proof")}:
                  </p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {task.proofRequirements.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {hasClaimed
                  ? t("worker.task.submit_proof")
                  : t("worker.task.action_required")}
              </CardTitle>
              <CardDescription>
                {hasClaimed
                  ? t("worker.task.provide_evidence")
                  : t("worker.task.claim_first")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasClaimed ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-muted sm:h-11 sm:w-11">
                    <ListChecks className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <AppIllustration
                    kind="campaign"
                    className="mb-2 max-w-[180px]"
                    fit="contain"
                  />
                  <h3 className="text-lg font-medium mb-2">
                    {t("worker.task.ready")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                    {t("worker.task.reserve_desc")}
                  </p>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={handleClaim}
                    disabled={claimMutation.isPending || isUnavailable}
                  >
                    {claimMutation.isPending
                      ? t("worker.task.claiming")
                      : isUnavailable
                        ? t("worker.task.unavailable")
                        : t("worker.task.claim_task")}
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmitProof)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("worker.task.username")}</FormLabel>
                          <FormControl>
                            <Input placeholder="@johndoe" {...field} />
                          </FormControl>
                          <FormDescription>
                            {t("worker.task.username_desc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="link"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("worker.task.public_link")}</FormLabel>
                          <FormControl>
                            <Input placeholder="https://..." {...field} />
                          </FormControl>
                          <FormDescription>
                            {t("worker.task.public_link_desc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <FormLabel>{t("worker.task.file_proof")}</FormLabel>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                        onChange={(event) =>
                          setScreenshot(event.target.files?.[0] ?? null)
                        }
                      />
                      <FormDescription>
                        {t("worker.task.file_desc")}
                      </FormDescription>
                      {screenshot && (
                        <div className="rounded-[14px] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          {screenshot.name} •{" "}
                          {(screenshot.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("worker.task.notes")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("worker.task.notes_placeholder")}
                              className="resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full mt-4"
                      disabled={submitMutation.isPending}
                    >
                      <UploadCloud className="w-4 h-4 mr-2" />
                      {submitMutation.isPending
                        ? t("worker.task.verifying")
                        : t("worker.task.submit_engine")}
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
