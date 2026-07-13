import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubmitKyc } from '@/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldCheck, CheckCircle2, Loader2, CreditCard, Scan,
  ArrowRight, AlertCircle, RotateCcw, ScanFace
} from 'lucide-react';
import { CameraCapture } from './camera-capture';
import { LivenessChallenge, type ChallengeKey, type LivenessSequenceCapture } from './liveness-challenge';

interface KycModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  userName: string;
}

type Step =
  | 'intro'
  | 'camera-front'
  | 'camera-back'
  | 'preparing-liveness'
  | 'liveness'
  | 'analyzing'
  | 'success'
  | 'failed';

const STEPS_CONFIG = [
  { key: 'camera-front', label: 'Recto de la carte', icon: CreditCard },
  { key: 'camera-back',  label: 'Verso de la carte', icon: Scan },
  { key: 'liveness',      label: 'Présence réelle',   icon: ScanFace },
];

const CAMERA_STEPS = ['camera-front', 'camera-back', 'liveness'];
const ANALYSIS_PHASES = [
  { min: 0, label: 'Préparation des preuves...' },
  { min: 24, label: 'Extraction des données de la carte...' },
  { min: 46, label: 'Vérification biométrique du visage...' },
  { min: 68, label: "Contrôle de l'authenticité du document..." },
  { min: 86, label: 'Recherche de doublons et décision...' },
  { min: 96, label: 'Finalisation de la vérification...' },
];

function extractKycErrorMessage(error: any): string {
  const data = error?.data;
  const candidates = [
    data?.message,
    data?.details?.reason,
    data?.details?.error,
    data?.error,
    error?.message,
  ];

  const message = candidates.find((item) => typeof item === 'string' && item.trim().length > 0);
  if (!message) return "La vérification n'a pas abouti. Recommencez avec une carte bien éclairée et un visage centré.";

  return String(message)
    .replace(/^HTTP\s+\d+\s+[^:]+:\s*/i, '')
    .replace('KYC processing failed. Please try again.', "La vérification n'a pas abouti. Recommencez avec une carte plus nette et un visage bien centré.");
}

export function KycModal({ open, onOpenChange, onSuccess, userName }: KycModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('intro');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage,  setBackImage]  = useState<string | null>(null);
  const [livenessSession, setLivenessSession] = useState<{ sessionId: string; order: ChallengeKey[] } | null>(null);
  const [liveFacePreview, setLiveFacePreview] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const submitKycMutation = useSubmitKyc();

  /* ── helpers ── */
  const resetAll = () => {
    setStep('intro');
    setFrontImage(null);
    setBackImage(null);
    setLivenessSession(null);
    setLiveFacePreview(null);
    setAnalyzeProgress(0);
    setFailedReason(null);
  };

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('wrtfm_token') ?? localStorage.getItem('cae_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const startLiveness = async () => {
    try {
      setStep('preparing-liveness');
      await new Promise((resolve) => window.setTimeout(resolve, 1_800));
      const response = await fetch('/api/users/me/kyc/liveness-session', {
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Session liveness impossible.');
      if (data?.alreadyVerified) {
        toast({ title: 'Identité déjà vérifiée', description: data.message });
        onSuccess?.();
        handleClose(false);
        return;
      }
      setLivenessSession(data);
      setStep('liveness');
    } catch (error) {
      setStep('camera-back');
      toast({
        variant: 'destructive',
        title: 'Liveness impossible',
        description: error instanceof Error ? error.message : 'Erreur de session liveness.',
      });
    }
  };

  const handleLivenessComplete = (capture: LivenessSequenceCapture) => {
    const liveFrames = capture.segments.blink.length
      ? capture.segments.blink
      : capture.segments.mouth.length
        ? capture.segments.mouth
        : capture.segments.head_turn;
    setLiveFacePreview(liveFrames[Math.floor(liveFrames.length / 2)] ?? null);
    startAnalysis(capture);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetAll();
    onOpenChange(v);
  };

  /* ── capture handlers ── */
  const handleFrontCapture  = (b64: string) => { setFrontImage(b64);  setStep('camera-back'); };
  const handleBackCapture   = (b64: string) => { setBackImage(b64); void startLiveness(); };

  /* ── analysis UI + real API call ── */
  const [realConfidence, setRealConfidence] = useState<number | null>(null);

  React.useEffect(() => {
    if (step !== 'analyzing') return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const softTarget = elapsed < 4_000 ? 38 : elapsed < 10_000 ? 64 : elapsed < 18_000 ? 82 : 94;
      setAnalyzeProgress((current) => Math.min(softTarget, current + (current < 55 ? 5 : 2)));
    }, 750);

    return () => window.clearInterval(timer);
  }, [step]);

  const analysisLabel =
    [...ANALYSIS_PHASES].reverse().find((phase) => analyzeProgress >= phase.min)?.label ??
    ANALYSIS_PHASES[0].label;

  const startAnalysis = (capture: LivenessSequenceCapture) => {
    setStep('analyzing');
    setAnalyzeProgress(18);
    setFailedReason(null);
    submitKycMutation.mutate(
        {
          frontImageData: frontImage || '',
          backImageData: backImage || '',
          livenessSessionId: capture.sessionId,
          livenessOrder: capture.order,
          livenessSegments: capture.segments,
        },
        {
          onSuccess: (data: any) => {
            const conf = data?.confidence ?? 88;
            setRealConfidence(conf);
            setAnalyzeProgress(100);
            setTimeout(() => setStep('success'), 500);
            toast({ title: 'KYC validé', description: `Identité vérifiée — Confiance : ${conf}%` });
            setTimeout(() => {
              onOpenChange(false);
              resetAll();
              if (onSuccess) onSuccess();
            }, 3500);
          },
          onError: (err: any) => {
            const message = extractKycErrorMessage(err);
            setFailedReason(message);
            setStep('failed');
            toast({
              variant: 'destructive',
              title: 'Vérification échouée',
              description: message,
            });
          },
        }
      );
  };

  /* ── step progress indicator ── */
  const currentStepIndex = CAMERA_STEPS.indexOf(step);

  /* ──────────────────── RENDER ──────────────────── */
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="grid max-h-[92svh] w-[calc(100vw-0.75rem)] max-w-[660px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-h-[90vh]">
        {/* Header */}
        <div className="border-b border-border px-3.5 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8 text-sm sm:text-base">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              Vérification d'identité — KYC
            </DialogTitle>
          </DialogHeader>

          {/* Step dots */}
          {CAMERA_STEPS.includes(step) && (
            <div className="mt-3 flex items-center gap-2 sm:mt-4">
              {STEPS_CONFIG.map((s, i) => (
                <React.Fragment key={s.key}>
                  <div className="flex items-center gap-1.5">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                      currentStepIndex > i
                        ? 'bg-green-500 text-white'
                        : currentStepIndex === i
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {currentStepIndex > i ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${currentStepIndex === i ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS_CONFIG.length - 1 && <div className={`flex-1 h-px transition-all ${currentStepIndex > i ? 'bg-green-500' : 'bg-border'}`} />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 overflow-y-auto px-3.5 py-3.5 sm:px-6 sm:py-5">

          {/* ── INTRO ── */}
          {step === 'intro' && (
            <div className="space-y-4 sm:space-y-5">
              <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                Pour débloquer les retraits, nous devons vérifier votre identité en 3 étapes rapides.
                Préparez votre <strong>carte d'identité nationale</strong> et assurez-vous d'être dans un <strong>endroit bien éclairé</strong>.
              </p>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {STEPS_CONFIG.map((s, i) => (
                  <div key={s.key} className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-2.5 sm:gap-2 sm:rounded-xl sm:p-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 sm:h-10 sm:w-10">
                      <s.icon className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                    </div>
                    <span className="max-w-full text-center text-[11px] font-medium leading-tight sm:text-xs">{s.label}</span>
                    <span className="text-[10px] text-muted-foreground">Étape {i + 1}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-[11px] leading-5 text-yellow-700 dark:text-yellow-400 sm:rounded-xl sm:text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Assurez-vous que la caméra est autorisée dans votre navigateur. Aucune image n'est stockée sur nos serveurs sans votre consentement.</span>
              </div>

              <Button className="w-full gap-2 group" onClick={() => setStep('camera-front')}>
                Commencer la vérification
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          )}

          {/* ── CAMERA FRONT ── */}
          {step === 'camera-front' && (
            <div className="space-y-3">
              <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                <strong>Étape 1 :</strong> Placez le <strong>recto de votre carte d'identité</strong> dans le cadre.
              </p>
              <CameraCapture
                mode="id"
                documentSide="front"
                onCapture={handleFrontCapture}
                onCancel={() => setStep('intro')}
              />
            </div>
          )}

          {/* ── CAMERA BACK ── */}
          {step === 'camera-back' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-medium text-green-600">Recto capturé avec succès</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                <strong>Étape 2 :</strong> Retournez la carte et placez le <strong>verso</strong> dans le cadre.
              </p>
              <CameraCapture
                mode="id"
                documentSide="back"
                onCapture={handleBackCapture}
                onCancel={() => { setFrontImage(null); setStep('camera-front'); }}
              />
            </div>
          )}

          {/* ── LIVENESS ACTIF ── */}
          {step === 'liveness' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-medium text-green-600">Carte ID capturée (recto + verso)</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                <strong>Étape 3 :</strong> Prouvez votre présence en effectuant les gestes demandés. La frame live validée sera utilisée pour comparer avec la photo de la carte.
              </p>
              {livenessSession && (
                <LivenessChallenge
                  sessionId={livenessSession.sessionId}
                  order={livenessSession.order}
                  onComplete={handleLivenessComplete}
                  onCancel={() => { setLivenessSession(null); setStep('camera-back'); }}
                />
              )}
            </div>
          )}

          {step === 'preparing-liveness' && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center sm:py-12">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">Préparation de la caméra frontale</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Gardez cette fenêtre ouverte. Nous libérons la caméra arrière avant de lancer la liveness.
                </p>
              </div>
            </div>
          )}

          {/* ── ANALYZING ── */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center space-y-5 py-8 sm:space-y-6 sm:py-10">
              {/* Animated scan ring */}
              <div className="relative h-20 w-20 sm:h-24 sm:w-24">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div
                  className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
                  style={{ animationDuration: '1.1s' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ShieldCheck className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <p className="text-base font-semibold sm:text-lg">Analyse en cours...</p>
                <p className="text-xs text-muted-foreground sm:text-sm">{analysisLabel}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progression</span>
                  <span className="whitespace-nowrap font-mono font-semibold tabular-nums">{analyzeProgress}%</span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${analyzeProgress}%` }}
                  />
                </div>
              </div>

              {/* Captured previews */}
              <div className="mt-1 flex max-w-full gap-2 sm:gap-3">
                {frontImage && (
                  <div className="relative">
                    <img src={frontImage} alt="Recto" className="h-14 w-20 rounded-lg border border-border object-cover sm:h-16 sm:w-24" />
                    <CheckCircle2 className="absolute -top-1.5 -right-1.5 h-4 w-4 text-green-500 bg-white rounded-full" />
                  </div>
                )}
                {backImage && (
                  <div className="relative">
                    <img src={backImage} alt="Verso" className="h-14 w-20 rounded-lg border border-border object-cover sm:h-16 sm:w-24" />
                    <CheckCircle2 className="absolute -top-1.5 -right-1.5 h-4 w-4 text-green-500 bg-white rounded-full" />
                  </div>
                )}
                {liveFacePreview && (
                  <div className="relative">
                    <img src={liveFacePreview} alt="Visage live" className="h-14 w-14 rounded-full border border-border object-cover sm:h-16 sm:w-16" />
                    <Loader2 className="absolute -top-1.5 -right-1.5 h-4 w-4 text-primary animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center space-y-5 py-8 text-center sm:py-10">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 sm:h-24 sm:w-24">
                  <CheckCircle2 className="h-10 w-10 text-green-500 sm:h-12 sm:w-12" />
                </div>
                {/* Pulse ring */}
                <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping opacity-30" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-green-600 sm:text-xl">Vérification réussie</h3>
                <p className="text-xs leading-5 text-muted-foreground sm:text-sm">Votre identité est confirmée. Vous pouvez maintenant effectuer des retraits.</p>
              </div>
              {liveFacePreview && (
                <div className="flex max-w-full items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-3 sm:px-4">
                  <img src={liveFacePreview} alt="Visage live vérifié" className="h-11 w-11 shrink-0 rounded-full border-2 border-green-500 object-cover sm:h-12 sm:w-12" />
                  <div className="min-w-0 space-y-1 text-left">
                <p className="truncate text-sm font-semibold">{userName}</p>
                <p className="flex items-center gap-1 text-xs text-green-600">
                  <ShieldCheck className="h-3 w-3" /> Identité vérifiée
                </p>
                {realConfidence !== null && (
                  <p className="text-xs text-muted-foreground">
                    Score de confiance : <span className="font-mono font-bold text-green-600">{realConfidence}%</span>
                  </p>
                )}
              </div>
                </div>
              )}
            </div>
          )}

          {/* ── FAILED ── */}
          {step === 'failed' && (
            <div className="flex flex-col items-center justify-center space-y-5 py-8 text-center sm:py-10">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 sm:h-24 sm:w-24">
                <AlertCircle className="h-10 w-10 text-destructive sm:h-12 sm:w-12" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-destructive sm:text-xl">Vérification échouée</h3>
                <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                  {failedReason || "Nous n'avons pas pu vérifier votre identité. Assurez-vous que la carte est bien lisible et recommencez."}
                </p>
              </div>
              <Button variant="outline" className="gap-2" onClick={resetAll}>
                <RotateCcw className="h-4 w-4" /> Recommencer
              </Button>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
