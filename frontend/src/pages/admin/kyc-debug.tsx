import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  Loader2,
  ShieldCheck,
  UploadCloud,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ScanFace,
  Gauge,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  LivenessChallenge,
  type ChallengeKey,
  type LivenessSequenceCapture,
} from "@/components/liveness-challenge";

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS & TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** data URI base64 → Blob pour l'envoi multipart */
function dataUriToBlob(uri: string): Blob {
  const [meta, b64] = uri.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const debugFormSchema = z.object({
  frontImage: z
    .instanceof(FileList)
    .refine((files) => files.length === 1, "Image recto requise."),
  backImage: z
    .instanceof(FileList)
    .refine((files) => files.length === 1, "Image verso requise."),
  selfieImage: z
    .instanceof(FileList)
    .refine((files) => files.length === 1, "Image selfie requise."),
});

type DebugFormValues = z.infer<typeof debugFormSchema>;

interface KycStepEvent {
  stepName: string;
  status: "pending" | "running" | "success" | "fail";
  duration?: number;
  data?: any;
  error?: string;
  timestamp: string;
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatScore(value: unknown, unit: "percent" | "ratio" = "percent") {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  if (unit === "ratio") return `${Math.round(value * 100)}%`;
  return `${Math.round(value)}%`;
}

function redactLargeBiometrics(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length > 24 && value.every((item) => typeof item === "number")) {
      return `[${value.length} valeurs masquées]`;
    }
    return value.map(redactLargeBiometrics);
  }
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      key.toLowerCase().includes("embedding")
        ? Array.isArray(nested)
          ? `[${nested.length} valeurs masquées]`
          : "[masqué]"
        : redactLargeBiometrics(nested),
    ]),
  );
}

function getStepHighlights(step: KycStepEvent): Array<{ label: string; value: string }> {
  const data = step.data ?? {};
  const highlights: Array<{ label: string; value: string }> = [];

  if (typeof data.confidence === "number") {
    highlights.push({ label: "Confiance", value: formatScore(data.confidence) });
  }
  if (typeof data.similarity === "number") {
    highlights.push({ label: "Similarité", value: formatScore(data.similarity, "ratio") });
  }
  if (typeof data.threshold === "number") {
    highlights.push({ label: "Seuil", value: formatScore(data.threshold, "ratio") });
  }
  if (typeof data.antiSpoofScore === "number") {
    highlights.push({ label: "Anti-spoof", value: formatScore(data.antiSpoofScore, "ratio") });
  }
  if (typeof data.isMatch === "boolean") {
    highlights.push({ label: "Match", value: data.isMatch ? "oui" : "non" });
  }
  if (typeof data.isLive === "boolean") {
    highlights.push({ label: "Live", value: data.isLive ? "oui" : "non" });
  }
  if (typeof data.numeroMifpdi === "string") {
    highlights.push({ label: "MIFPDI", value: data.numeroMifpdi });
  }
  if (typeof data.normalizedCommune === "string") {
    highlights.push({ label: "Commune", value: data.normalizedCommune });
  }

  return highlights.slice(0, 4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getUploadError(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const typed = error as {
      data?: { message?: string; error?: string };
      message?: string;
    };
    return (
      typed.data?.message ??
      typed.data?.error ??
      typed.message ??
      "Erreur inconnue."
    );
  }
  return error instanceof Error ? error.message : "Erreur inconnue.";
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT FILE FIELD
// ═══════════════════════════════════════════════════════════════════════════════

function FileField({
  id,
  label,
  register,
  error,
}: {
  id: keyof DebugFormValues;
  label: string;
  register: ReturnType<typeof useForm<DebugFormValues>>["register"];
  error?: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <Label
        htmlFor={id}
        className="mb-2 flex items-center gap-2 text-sm font-medium"
      >
        <FileImage className="h-4 w-4" />
        {label}
      </Label>
      <Input id={id} type="file" accept="image/*" {...register(id)} />
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT CARTE D'ÉTAPE ANIMÉE
// ═══════════════════════════════════════════════════════════════════════════════

function KycStepCard({ step, index }: { step: KycStepEvent; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (step.status) {
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBorderClass = () => {
    switch (step.status) {
      case "pending":
        return "border-muted-foreground/20 bg-muted/10";
      case "running":
        return "border-primary/50 bg-primary/5";
      case "success":
        return "border-emerald-500/50 bg-emerald-500/5";
      case "fail":
        return "border-destructive/50 bg-destructive/5";
    }
  };

  const getBadgeVariant = ():
    | "default"
    | "destructive"
    | "secondary"
    | "outline" => {
    switch (step.status) {
      case "success":
        return "default";
      case "fail":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const hasDetails = Boolean(step.data || step.error);
  const highlights = getStepHighlights(step);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className={`border rounded-lg p-4 ${getStatusBorderClass()}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {getStatusIcon()}
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate">{step.stepName}</h3>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <Badge
                variant={getBadgeVariant()}
                className="text-[10px] h-5 px-1.5"
              >
                {step.status}
              </Badge>
              {step.duration !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(step.duration)}
                </span>
              )}
            </div>
          </div>
        </div>

        {hasDetails && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {highlights.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {highlights.map((item) => (
            <div key={`${step.stepName}-${item.label}`} className="rounded-md border bg-background/75 px-2.5 py-2">
              <div className="text-[10px] font-medium uppercase text-muted-foreground">
                {item.label}
              </div>
              <div className="truncate text-xs font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {hasDetails && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent className="mt-3">
            <div className="rounded border bg-muted/70 p-3">
              <pre className="text-xs overflow-auto max-h-48 leading-relaxed whitespace-pre-wrap break-words">
                {step.error
                  ? step.error
                  : JSON.stringify(redactLargeBiometrics(step.data), null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </motion.div>
  );
}

function FinalSummary({ result }: { result: any }) {
  const face = result?.faceMatching;
  const liveness = result?.liveness;
  const ocr = result?.ocr;

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Décision</span>
            <Badge variant={result?.approved ? "default" : "destructive"}>
              {result?.approved ? "Approuvé" : "Rejeté"}
            </Badge>
          </div>
          <div className="text-2xl font-semibold">{formatScore(result?.confidence)}</div>
          <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{result?.reason}</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ScanFace className="h-3.5 w-3.5" />
            Face match
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold">{formatScore(face?.similarity, "ratio")}</div>
            <Badge variant={face?.isMatch ? "default" : "destructive"}>
              seuil {formatScore(face?.threshold, "ratio")}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{face?.method ?? "N/A"}</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Liveness
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold">
              {formatScore(liveness?.antiSpoofing?.score, "ratio")}
            </div>
            <Badge variant={liveness?.isLive ? "default" : "destructive"}>
              {liveness?.isLive ? "live" : "bloqué"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Anti-spoofing passif + tests actifs</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            OCR document
          </div>
          <div className="text-2xl font-semibold">{formatScore(ocr?.confidence)}</div>
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {ocr?.officialFields?.numeroMifpdi ?? "MIFPDI non extrait"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminKycDebugPage() {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [steps, setSteps] = useState<KycStepEvent[]>([]);
  const [finalResult, setFinalResult] = useState<any | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showFullResult, setShowFullResult] = useState(false);
  const [livenessCapture, setLivenessCapture] =
    useState<LivenessSequenceCapture | null>(null);
  const [livenessSession, setLivenessSession] =
    useState<{ sessionId: string; order: ChallengeKey[] } | null>(null);
  const [showLivenessCapture, setShowLivenessCapture] = useState(false);

  const form = useForm<DebugFormValues>({
    resolver: zodResolver(debugFormSchema),
  });

  const resetAnalysis = () => {
    setSteps([]);
    setFinalResult(null);
    setLastError(null);
    setIsAnalyzing(false);
    setShowFullResult(false);
  };

  const startLivenessCapture = async () => {
    try {
      const token =
        localStorage.getItem("wrtfm_token") ??
        localStorage.getItem("cae_token");
      const response = await fetch("/api/admin/kyc-burundi/liveness-session", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${response.status}`);
      }
      const session = (await response.json()) as {
        sessionId: string;
        order: ChallengeKey[];
      };
      setLivenessSession(session);
      setLivenessCapture(null);
      setShowLivenessCapture(true);
    } catch (error) {
      toast({
        title: "Session liveness impossible",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: DebugFormValues) => {
    const totalFrames = livenessCapture
      ? Object.values(livenessCapture.segments).reduce((sum, frames) => sum + frames.length, 0)
      : 0;
    const hasValidSegments =
      livenessCapture &&
      (["blink", "head_turn", "mouth"] as ChallengeKey[]).every((key) => {
        const count = livenessCapture.segments[key]?.length ?? 0;
        return count >= 5 && count <= 8;
      });

    if (!hasValidSegments) {
      toast({
        title: "Liveness caméra requis",
        description: `Capturez les 3 segments serveur avant l'analyse (actuel: ${totalFrames} frames).`,
        variant: "destructive",
      });
      setShowLivenessCapture(true);
      return;
    }

    resetAnalysis();
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append("frontImage", data.frontImage[0]);
    formData.append("backImage", data.backImage[0]);
    formData.append("selfieImage", data.selfieImage[0]);
    formData.append("livenessSessionId", livenessCapture.sessionId);
    formData.append("livenessOrder", JSON.stringify(livenessCapture.order));
    livenessCapture.segments.blink.forEach((frame, index) => {
      formData.append("livenessBlinkFrames", dataUriToBlob(frame), `blink-${index}.jpg`);
    });
    livenessCapture.segments.head_turn.forEach((frame, index) => {
      formData.append("livenessHeadTurnFrames", dataUriToBlob(frame), `head-turn-${index}.jpg`);
    });
    livenessCapture.segments.mouth.forEach((frame, index) => {
      formData.append("livenessMouthFrames", dataUriToBlob(frame), `mouth-${index}.jpg`);
    });

    try {
      // EventSource ne supporte que GET — on utilise fetch + ReadableStream
      // pour consommer directement le body SSE de la réponse POST
      const token =
        localStorage.getItem("wrtfm_token") ??
        localStorage.getItem("cae_token");
      const response = await fetch("/api/admin/kyc-burundi/debug-test-sse", {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Pas de body SSE dans la réponse");
      }

      // Lecture du flux SSE ligne par ligne via ReadableStream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Garder la dernière ligne potentiellement incomplète dans le buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Format SSE : "data: {...}"
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const stepEvent: KycStepEvent = JSON.parse(raw);

              if (stepEvent.stepName === "RÉSULTAT FINAL") {
                setFinalResult(stepEvent.data);
                toast({
                  title: "Analyse terminée",
                  description: "Résultat complet reçu depuis le backend.",
                });
              } else if (stepEvent.stepName === "ERREUR FATALE") {
                const msg = stepEvent.error || "Erreur fatale inconnue";
                setLastError(msg);
                toast({
                  variant: "destructive",
                  title: "Erreur fatale",
                  description: msg,
                });
              } else {
                // Mise à jour ou ajout de l'étape dans la liste
                setSteps((prev) => {
                  const idx = prev.findIndex(
                    (s) => s.stepName === stepEvent.stepName,
                  );
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = stepEvent;
                    return next;
                  }
                  return [...prev, stepEvent];
                });
              }
            } catch (parseError) {
              console.error("[KYC SSE] Erreur parsing event:", parseError, raw);
            }
          }
        }
      }
    } catch (error) {
      const message = getUploadError(error);
      setLastError(message);
      toast({
        variant: "destructive",
        title: "Erreur lors du test",
        description: message,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const successCount = steps.filter((s) => s.status === "success").length;
  const failCount = steps.filter((s) => s.status === "fail").length;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 lg:px-6">
      {/* En-tête */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            <Badge variant="secondary" className="text-[11px]">
              Admin debug temps réel
            </Badge>
          </div>
          <h1 className="text-balance text-xl font-semibold tracking-normal sm:text-2xl lg:text-3xl">
            Test du moteur KYC burundais
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-[15px]">
            Suivi en temps réel de chaque étape du pipeline KYC. Aucun mock,
            résultats authentiques.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={
              isAnalyzing ? "default" : finalResult ? "secondary" : "outline"
            }
            className="w-fit"
          >
            {isAnalyzing
              ? "Analyse en cours…"
              : finalResult
                ? "Terminé"
                : "Prêt"}
          </Badge>
          {steps.length > 0 && (
            <>
              <Badge variant="outline" className="text-[10px]">
                {successCount} ok
              </Badge>
              {failCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {failCount} échec
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {lastError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pipeline interrompu avant décision finale</AlertTitle>
          <AlertDescription className="break-words text-sm">
            {lastError}
          </AlertDescription>
        </Alert>
      )}

      {finalResult && <FinalSummary result={finalResult} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {/* === PANEL UPLOAD === */}
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1 p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <UploadCloud className="h-4 w-4 sm:h-5 sm:w-5" />
              Documents à analyser
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FileField
                id="frontImage"
                label="Image recto"
                register={form.register}
                error={form.formState.errors.frontImage?.message}
              />
              <FileField
                id="backImage"
                label="Image verso"
                register={form.register}
                error={form.formState.errors.backImage?.message}
              />
              <FileField
                id="selfieImage"
                label="Image selfie"
                register={form.register}
                error={form.formState.errors.selfieImage?.message}
              />

              {/* Liveness actif : capture des défis à la caméra */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-2">
                    <ScanFace className="h-4 w-4" />
                    Liveness actif (défis caméra)
                  </Label>
                  {livenessCapture ? (
                    <Badge variant="secondary">
                      {Object.values(livenessCapture.segments).reduce((sum, frames) => sum + frames.length, 0)} frames / 3 segments ✓
                    </Badge>
                  ) : (
                    <Badge variant="outline">non capturé</Badge>
                  )}
                </div>
                {showLivenessCapture ? (
                  livenessSession ? (
                    <LivenessChallenge
                      sessionId={livenessSession.sessionId}
                      order={livenessSession.order}
                      segmentEndpoint="/api/admin/kyc-burundi/liveness-segment"
                      transport="multipart"
                      onComplete={(capture) => {
                        setLivenessCapture(capture);
                        setShowLivenessCapture(false);
                        toast({
                          title: "Défis capturés",
                          description: `${Object.values(capture.segments).reduce((sum, frames) => sum + frames.length, 0)} frames prêtes — vérification serveur segmentée.`,
                        });
                      }}
                      onCancel={() => setShowLivenessCapture(false)}
                    />
                  ) : null
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9"
                    disabled={isAnalyzing}
                    onClick={startLivenessCapture}
                  >
                    {livenessCapture
                      ? "Refaire les défis caméra"
                      : "Capturer les défis (caméra)"}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Défis séquentiels obligatoires: le serveur choisit l'ordre et
                  vérifie chaque segment selon le geste attendu.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="submit"
                  disabled={isAnalyzing}
                  className="h-10 flex-1"
                >
                  {isAnalyzing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Lancer l'analyse
                </Button>
                {steps.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetAnalysis}
                    className="h-10"
                  >
                    Réinitialiser
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* === PANEL ÉTAPES === */}
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1 p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
              Suivi des étapes en temps réel
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0 space-y-3">
            {/* Liste d'étapes scrollable */}
            <div className="h-[min(60vh,560px)] overflow-y-auto space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {steps.map((step, index) => (
                  <KycStepCard
                    key={`${step.stepName}-${step.status}`}
                    step={step}
                    index={index}
                  />
                ))}
              </AnimatePresence>

              {steps.length === 0 && !isAnalyzing && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <div className="space-y-2 text-center">
                    <Clock className="h-8 w-8 mx-auto opacity-40" />
                    <p className="text-sm">En attente de l'analyse…</p>
                  </div>
                </div>
              )}

              {isAnalyzing && steps.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
                  <span className="text-sm text-muted-foreground">
                    Connexion au pipeline…
                  </span>
                </div>
              )}
            </div>

            {/* JSON complet repliable */}
            {finalResult && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Résultat JSON complet
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFullResult(!showFullResult)}
                    className="h-8 text-xs gap-1"
                  >
                    {showFullResult ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {showFullResult ? "Masquer" : "Voir JSON brut"}
                  </Button>
                </div>

                {showFullResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="rounded border bg-muted/70 p-3">
                      <pre className="text-[10px] overflow-auto max-h-72 leading-relaxed">
                        {JSON.stringify(redactLargeBiometrics(finalResult), null, 2)}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
