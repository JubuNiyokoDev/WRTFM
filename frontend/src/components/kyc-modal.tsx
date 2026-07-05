import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubmitKyc } from '@/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldCheck, CheckCircle2, Loader2, CreditCard, Scan, UserRound,
  ArrowRight, AlertCircle, RotateCcw
} from 'lucide-react';
import { CameraCapture } from './camera-capture';

interface KycModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  userName: string;
}

type Step = 'intro' | 'camera-front' | 'camera-back' | 'camera-selfie' | 'analyzing' | 'success' | 'failed';

const STEPS_CONFIG = [
  { key: 'camera-front', label: 'Recto de la carte', icon: CreditCard },
  { key: 'camera-back',  label: 'Verso de la carte', icon: Scan },
  { key: 'camera-selfie', label: 'Selfie du visage',  icon: UserRound },
];

export function KycModal({ open, onOpenChange, onSuccess, userName }: KycModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('intro');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage,  setBackImage]  = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const submitKycMutation = useSubmitKyc();

  /* ── helpers ── */
  const resetAll = () => {
    setStep('intro');
    setFrontImage(null);
    setBackImage(null);
    setSelfieImage(null);
    setAnalyzeProgress(0);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetAll();
    onOpenChange(v);
  };

  /* ── capture handlers ── */
  const handleFrontCapture  = (b64: string) => { setFrontImage(b64);  setStep('camera-back'); };
  const handleBackCapture   = (b64: string) => { setBackImage(b64);   setStep('camera-selfie'); };
  const handleSelfieCapture = (b64: string) => { setSelfieImage(b64); startAnalysis(b64); };

  /* ── analysis simulation + real API call ── */
  const [realConfidence, setRealConfidence] = useState<number | null>(null);

  const startAnalysis = (selfie: string) => {
    setStep('analyzing');
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 12) + 5;
      if (progress >= 90) { progress = 90; clearInterval(interval); }
      setAnalyzeProgress(progress);
    }, 300);

    setTimeout(() => {
      submitKycMutation.mutate(
        { idCardData: frontImage || '', selfieData: selfie },
        {
          onSuccess: (data: any) => {
            clearInterval(interval);
            const conf = data?.confidence ?? 88;
            setRealConfidence(conf);
            setAnalyzeProgress(100);
            setTimeout(() => setStep('success'), 500);
            toast({ title: 'KYC Validé ✅', description: `Identité vérifiée — Confiance : ${conf}%` });
            setTimeout(() => {
              onOpenChange(false);
              resetAll();
              if (onSuccess) onSuccess();
            }, 3500);
          },
          onError: (err: any) => {
            clearInterval(interval);
            setStep('failed');
            toast({
              variant: 'destructive',
              title: 'Vérification échouée',
              description: err?.data?.error || err?.message || 'Erreur lors de la vérification.',
            });
          },
        }
      );
    }, 2000);
  };

  /* ── step progress indicator ── */
  const currentStepIndex = ['camera-front', 'camera-back', 'camera-selfie'].indexOf(step);

  /* ──────────────────── RENDER ──────────────────── */
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[660px] p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Vérification d'identité — KYC
            </DialogTitle>
          </DialogHeader>

          {/* Step dots */}
          {['camera-front', 'camera-back', 'camera-selfie'].includes(step) && (
            <div className="flex items-center gap-2 mt-4">
              {STEPS_CONFIG.map((s, i) => (
                <React.Fragment key={s.key}>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
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
                  {i < 2 && <div className={`flex-1 h-px transition-all ${currentStepIndex > i ? 'bg-green-500' : 'bg-border'}`} />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* ── INTRO ── */}
          {step === 'intro' && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Pour débloquer les retraits, nous devons vérifier votre identité en 3 étapes rapides.
                Préparez votre <strong>carte d'identité nationale</strong> et assurez-vous d'être dans un <strong>endroit bien éclairé</strong>.
              </p>

              <div className="grid grid-cols-3 gap-3">
                {STEPS_CONFIG.map((s, i) => (
                  <div key={s.key} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-center">{s.label}</span>
                    <span className="text-[10px] text-muted-foreground">Étape {i + 1}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 flex gap-2 text-xs text-yellow-700 dark:text-yellow-400">
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
              <p className="text-sm text-muted-foreground">
                <strong>Étape 1 :</strong> Placez le <strong>recto de votre carte d'identité</strong> dans le cadre.
              </p>
              <CameraCapture
                mode="id"
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
                <span className="text-xs text-green-600 font-medium">Recto capturé avec succès</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <strong>Étape 2 :</strong> Retournez la carte et placez le <strong>verso</strong> dans le cadre.
              </p>
              <CameraCapture
                mode="id"
                onCapture={handleBackCapture}
                onCancel={() => { setFrontImage(null); setStep('camera-front'); }}
              />
            </div>
          )}

          {/* ── CAMERA SELFIE ── */}
          {step === 'camera-selfie' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs text-green-600 font-medium">Carte ID capturée (recto + verso)</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <strong>Étape 3 :</strong> Regardez directement la caméra, visage bien visible dans l'ovale.
              </p>
              <CameraCapture
                mode="selfie"
                onCapture={handleSelfieCapture}
                onCancel={() => { setBackImage(null); setStep('camera-back'); }}
              />
            </div>
          )}

          {/* ── ANALYZING ── */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-6">
              {/* Animated scan ring */}
              <div className="relative h-24 w-24">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div
                  className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
                  style={{ animationDuration: '1.1s' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ShieldCheck className="h-10 w-10 text-primary" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <p className="font-semibold text-lg">Analyse en cours…</p>
                <p className="text-sm text-muted-foreground">
                  {analyzeProgress < 40 && 'Extraction des données de la carte…'}
                  {analyzeProgress >= 40 && analyzeProgress < 75 && 'Vérification biométrique du visage…'}
                  {analyzeProgress >= 75 && analyzeProgress < 95 && 'Contrôle de l\'authenticité du document…'}
                  {analyzeProgress >= 95 && 'Finalisation de la vérification…'}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progression</span>
                  <span className="font-mono font-semibold">{analyzeProgress}%</span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${analyzeProgress}%` }}
                  />
                </div>
              </div>

              {/* Captured previews */}
              <div className="flex gap-3 mt-2">
                {frontImage && (
                  <div className="relative">
                    <img src={frontImage} alt="Recto" className="h-16 w-24 object-cover rounded-lg border border-border" />
                    <CheckCircle2 className="absolute -top-1.5 -right-1.5 h-4 w-4 text-green-500 bg-white rounded-full" />
                  </div>
                )}
                {backImage && (
                  <div className="relative">
                    <img src={backImage} alt="Verso" className="h-16 w-24 object-cover rounded-lg border border-border" />
                    <CheckCircle2 className="absolute -top-1.5 -right-1.5 h-4 w-4 text-green-500 bg-white rounded-full" />
                  </div>
                )}
                {selfieImage && (
                  <div className="relative">
                    <img src={selfieImage} alt="Selfie" className="h-16 w-16 object-cover rounded-full border border-border" />
                    <Loader2 className="absolute -top-1.5 -right-1.5 h-4 w-4 text-primary animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-5 text-center">
              <div className="relative">
                <div className="h-24 w-24 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
                {/* Pulse ring */}
                <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping opacity-30" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-green-600">Vérification réussie !</h3>
                <p className="text-sm text-muted-foreground">Votre identité est confirmée. Vous pouvez maintenant effectuer des retraits.</p>
              </div>
              {selfieImage && (
                <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
                  <img src={selfieImage} alt="Profil" className="h-12 w-12 rounded-full object-cover border-2 border-green-500" />
                  <div className="space-y-1">
                <p className="font-semibold text-sm">{userName}</p>
                <p className="text-xs text-green-600 flex items-center gap-1">
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
            <div className="flex flex-col items-center justify-center py-10 space-y-5 text-center">
              <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-destructive">Vérification échouée</h3>
                <p className="text-sm text-muted-foreground">
                  Nous n'avons pas pu vérifier votre identité. Assurez-vous que la carte est bien lisible et recommencez.
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

