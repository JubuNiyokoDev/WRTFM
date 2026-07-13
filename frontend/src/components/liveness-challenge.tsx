import { useRef, useState, useEffect, useCallback } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { Button } from '@/components/ui/button';
import { X, RefreshCw, Eye, MoveHorizontal, Smile, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';

interface LivenessChallengeProps {
  sessionId: string;
  order: ChallengeKey[];
  segmentEndpoint?: string;
  transport?: 'json' | 'multipart';
  showDebug?: boolean;
  onComplete: (result: LivenessSequenceCapture) => void;
  onCancel: () => void;
}

export type ChallengeKey = 'blink' | 'head_turn' | 'mouth';

export interface LivenessSequenceCapture {
  sessionId: string;
  order: ChallengeKey[];
  segments: Record<ChallengeKey, string[]>;
}

interface Challenge {
  key: ChallengeKey;
  label: string;
  hint: string;
  help: string;
  icon: typeof Eye;
}

const CHALLENGES: Challenge[] = [
  {
    key: 'blink',
    label: 'Clignez des yeux maintenant',
    hint: 'Fermez puis ouvrez les yeux franchement',
    help: 'Clignez plus franchement en regardant bien la caméra.',
    icon: Eye,
  },
  {
    key: 'head_turn',
    label: 'Tournez la tête maintenant',
    hint: 'Tournez nettement à gauche puis à droite',
    help: 'Tournez la tête plus nettement, sans sortir du cadre.',
    icon: MoveHorizontal,
  },
  {
    key: 'mouth',
    label: 'Ouvrez la bouche maintenant',
    hint: 'Ouvrez grand la bouche puis refermez-la',
    help: 'Ouvrez la bouche plus grand, puis refermez-la.',
    icon: Smile,
  },
];

const CAPTURE_WIDTH = 480;
const FRAME_CAPTURE_MS = 170;
const ANALYSIS_INTERVAL_MS = 90;
const MAX_SEGMENT_FRAMES = 8;
const MIN_SEGMENT_FRAMES = 5;
const ENV_STABLE_FRAMES = 8;
const MIN_LUMINANCE = 55;
const MAX_LUMINANCE = 215;
const MIN_FACE_BOX_AREA = 0.025;
const MIN_ENV_EAR = 0.1;
const MAX_FACE_CENTER_OFFSET = 0.24;
const HELP_AFTER_MS = 12_000;
const CHALLENGE_PREPARE_MS = 3_500;

const BLINK_EAR_DROP_TRIGGER = 0.025;
const BLINK_EAR_RATIO_TRIGGER = 0.08;
const MOUTH_MAR_TRIGGER = 0.07;
const HEAD_YAW_PROXY_TRIGGER = 0.14;

type Phase = 'loading' | 'environment' | 'challenge' | 'confirming' | 'confirmed' | 'done';

interface LiveMetrics {
  ear: number;
  mar: number;
  yawProxy: number;
  luminance: number;
  faceArea: number;
  faceCount: number;
  centerOffset: number;
  overexposedRatio: number;
}

function emptySegments(): Record<ChallengeKey, string[]> {
  return { blink: [], head_turn: [], mouth: [] };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ear(landmarks: NormalizedLandmark[], indices: number[]) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index]);
  const horizontal = distance(p1, p4);
  if (horizontal <= 1e-6) return 0;
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

function metricsFromLandmarks(
  landmarks: NormalizedLandmark[],
  luminance: number,
  faceCount: number,
  overexposedRatio: number,
): LiveMetrics {
  const leftEar = ear(landmarks, [33, 160, 158, 133, 153, 144]);
  const rightEar = ear(landmarks, [362, 385, 387, 263, 373, 380]);
  const mouthHorizontal = distance(landmarks[78], landmarks[308]);
  const mar = mouthHorizontal > 1e-6 ? distance(landmarks[13], landmarks[14]) / mouthHorizontal : 0;
  const eyeDistance = distance(landmarks[33], landmarks[263]);
  const eyeMidX = (landmarks[33].x + landmarks[263].x) / 2;
  const yawProxy = eyeDistance > 1e-6 ? (landmarks[1].x - eyeMidX) / eyeDistance : 0;
  const xs = landmarks.map((landmark) => landmark.x);
  const ys = landmarks.map((landmark) => landmark.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const faceArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  return {
    ear: (leftEar + rightEar) / 2,
    mar,
    yawProxy,
    luminance,
    faceArea,
    faceCount,
    centerOffset: Math.hypot(centerX - 0.5, centerY - 0.5),
    overexposedRatio,
  };
}

function range(values: number[]) {
  return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
}

function maxDrop(values: number[]) {
  if (values.length < 3) return { drop: 0, ratio: 0 };
  let drop = 0;
  const baseline = Math.max(...values);
  for (let index = 0; index < values.length; index++) {
    const before = Math.max(...values.slice(0, index + 1));
    const after = Math.max(...values.slice(index));
    drop = Math.max(drop, Math.min(before, after) - values[index]);
  }
  return { drop, ratio: baseline > 1e-6 ? drop / baseline : 0 };
}

function detectLocalGesture(challenge: ChallengeKey, history: LiveMetrics[]) {
  const ears = history.map((item) => item.ear);
  const mars = history.map((item) => item.mar);
  const yaws = history.map((item) => item.yawProxy);
  const blink = maxDrop(ears);
  const mouthRange = range(mars);
  const yawRange = range(yaws);

  if (challenge === 'blink') {
    return blink.drop >= BLINK_EAR_DROP_TRIGGER || blink.ratio >= BLINK_EAR_RATIO_TRIGGER;
  }
  if (challenge === 'mouth') {
    return mouthRange >= MOUTH_MAR_TRIGGER;
  }
  return yawRange >= HEAD_YAW_PROXY_TRIGGER;
}

function challengeLabel(key: ChallengeKey) {
  return CHALLENGES.find((item) => item.key === key) ?? CHALLENGES[0];
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function openUserCameraWithRetry(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } } },
    { video: { facingMode: 'user' } },
    { video: true },
  ];

  let lastError: unknown;
  for (let index = 0; index < attempts.length; index++) {
    try {
      return await navigator.mediaDevices.getUserMedia(attempts[index]);
    } catch (error) {
      lastError = error;
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotReadableError' || name === 'AbortError') {
        await delay(1_250);
        continue;
      }
      if (index < attempts.length - 1) {
        await delay(350);
        continue;
      }
    }
  }
  throw lastError;
}

export function LivenessChallenge({
  sessionId,
  order,
  segmentEndpoint = '/api/users/me/kyc/liveness-segment',
  transport = 'json',
  showDebug = false,
  onComplete,
  onCancel,
}: LivenessChallengeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const challengeStartedAtRef = useRef(0);
  const confirmingRef = useRef(false);
  const segmentsRef = useRef<Record<ChallengeKey, string[]>>(emptySegments());
  const rollingFramesRef = useRef<string[]>([]);
  const metricsHistoryRef = useRef<LiveMetrics[]>([]);
  const stableFaceFramesRef = useRef(0);
  const challengeReadyAtRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Initialisation caméra...');
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [lastMetrics, setLastMetrics] = useState<LiveMetrics | null>(null);
  const [confirmedKey, setConfirmedKey] = useState<ChallengeKey | null>(null);
  const [serverDebug, setServerDebug] = useState<string | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    const scale = CAPTURE_WIDTH / video.videoWidth;
    canvas.width = CAPTURE_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.84);
  }, []);

  const analyzeFrame = useCallback((): LiveMetrics | null => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.videoWidth === 0) return null;

    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    const scale = CAPTURE_WIDTH / video.videoWidth;
    canvas.width = CAPTURE_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let lumaSum = 0;
    let overexposed = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const luma =
        image.data[offset] * 0.2126 +
        image.data[offset + 1] * 0.7152 +
        image.data[offset + 2] * 0.0722;
      lumaSum += luma;
      if (luma > 242) overexposed++;
    }
    const luminance = lumaSum / (image.data.length / 4);
    const result = landmarker.detectForVideo(video, performance.now());
    const faceCount = result.faceLandmarks.length;
    const face = result.faceLandmarks[0];
    const overexposedRatio = overexposed / (image.data.length / 4);
    if (!face) {
      return { ear: 0, mar: 0, yawProxy: 0, luminance, faceArea: 0, faceCount, centerOffset: 1, overexposedRatio };
    }
    return metricsFromLandmarks(face, luminance, faceCount, overexposedRatio);
  }, []);

  const confirmSegment = useCallback(async (challenge: ChallengeKey, frames: string[]) => {
    confirmingRef.current = true;
    setPhase('confirming');
    setStatusMessage('Confirmation serveur du geste...');
    setServerDebug(null);

    const token =
      localStorage.getItem('wrtfm_token') ??
      localStorage.getItem('cae_token');
    const response = transport === 'multipart'
      ? await fetch(segmentEndpoint, {
          method: 'POST',
          body: (() => {
            const formData = new FormData();
            formData.append('livenessSessionId', sessionId);
            formData.append('expectedChallenge', challenge);
            frames.forEach((frame, index) => {
              formData.append('frames', dataUriToBlob(frame), `${challenge}-${index}.jpg`);
            });
            return formData;
          })(),
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      : await fetch(segmentEndpoint, {
          method: 'POST',
          body: JSON.stringify({
            livenessSessionId: sessionId,
            expectedChallenge: challenge,
            frames,
          }),
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
    const result = await response.json().catch(() => ({}));
    if (showDebug) {
      const debug = JSON.stringify({
        passed: result?.passed,
        measures: result?.measures,
        series: result?.series,
      });
      setServerDebug(debug);
    }

    if (!response.ok || !result?.passed) {
      confirmingRef.current = false;
      setPhase('challenge');
      const current = challengeLabel(challenge);
      setStatusMessage(result?.error || result?.reason || current.help);
      metricsHistoryRef.current = [];
        rollingFramesRef.current = [];
        const readyAt = Date.now() + CHALLENGE_PREPARE_MS;
        challengeReadyAtRef.current = readyAt;
        challengeStartedAtRef.current = readyAt;
        setStatusMessage(`Préparez-vous: ${challengeLabel(challenge).hint}`);
      return;
    }

    segmentsRef.current[challenge] = frames;
    setConfirmedKey(challenge);
    setPhase('confirmed');
    setStatusMessage('Geste confirmé par le serveur.');

    window.setTimeout(() => {
      confirmingRef.current = false;
      const nextIndex = challengeIndex + 1;
      if (nextIndex >= order.length) {
        setPhase('done');
        stopLoop();
        stopStream();
        onComplete({
          sessionId,
          order,
          segments: segmentsRef.current,
        });
      } else {
        setChallengeIndex(nextIndex);
        metricsHistoryRef.current = [];
        rollingFramesRef.current = [];
        const readyAt = Date.now() + CHALLENGE_PREPARE_MS;
        challengeReadyAtRef.current = readyAt;
        challengeStartedAtRef.current = readyAt;
        setPhase('challenge');
        setStatusMessage(`Préparez-vous: ${challengeLabel(order[nextIndex]).hint}`);
      }
    }, 850);
  }, [challengeIndex, onComplete, order, segmentEndpoint, sessionId, showDebug, stopLoop, stopStream, transport]);

  const liveLoop = useCallback(() => {
    const now = Date.now();
    const metrics = analyzeFrame();
    if (metrics) {
      setLastMetrics(metrics);
      const faceStable =
        metrics.faceCount === 1 &&
        metrics.faceArea >= MIN_FACE_BOX_AREA &&
        metrics.luminance >= MIN_LUMINANCE &&
        metrics.luminance <= MAX_LUMINANCE &&
        metrics.overexposedRatio < 0.16 &&
        metrics.centerOffset <= MAX_FACE_CENTER_OFFSET &&
        metrics.ear >= MIN_ENV_EAR;
      stableFaceFramesRef.current = faceStable ? stableFaceFramesRef.current + 1 : 0;

      if (phase === 'environment') {
        if (metrics.luminance < MIN_LUMINANCE) {
          setStatusMessage('Améliorez l’éclairage.');
        } else if (metrics.luminance > MAX_LUMINANCE || metrics.overexposedRatio >= 0.16) {
          setStatusMessage('Trop de reflets sur le visage. Changez légèrement l’angle ou la lumière.');
        } else if (metrics.faceCount > 1) {
          setStatusMessage('Une seule personne doit être visible dans la caméra.');
        } else if (metrics.faceArea <= 0) {
          setStatusMessage('Placez votre visage face à la caméra.');
        } else if (metrics.faceArea < MIN_FACE_BOX_AREA) {
          setStatusMessage('Rapprochez-vous de la caméra.');
        } else if (metrics.centerOffset > MAX_FACE_CENTER_OFFSET) {
          setStatusMessage('Centrez votre visage dans l’ovale.');
        } else if (metrics.ear < MIN_ENV_EAR) {
          setStatusMessage('Gardez les yeux bien visibles. Retirez les lunettes sombres ou évitez les reflets.');
        } else if (stableFaceFramesRef.current < ENV_STABLE_FRAMES) {
          setStatusMessage('Gardez le visage stable quelques instants.');
        } else {
          metricsHistoryRef.current = [];
          rollingFramesRef.current = [];
          challengeReadyAtRef.current = now + CHALLENGE_PREPARE_MS;
          challengeStartedAtRef.current = challengeReadyAtRef.current;
          setChallengeIndex(0);
          setPhase('challenge');
          setStatusMessage(`Préparez-vous: ${challengeLabel(order[0]).hint}`);
        }
      } else if (phase === 'challenge' && !confirmingRef.current) {
        const challenge = order[challengeIndex] ?? 'blink';
        if (now < challengeReadyAtRef.current) {
          const seconds = Math.max(1, Math.ceil((challengeReadyAtRef.current - now) / 1000));
          setStatusMessage(`${challengeLabel(challenge).hint} dans ${seconds}s`);
          metricsHistoryRef.current = [];
          rollingFramesRef.current = [];
          rafRef.current = requestAnimationFrame(liveLoop);
          return;
        }

        if (now - lastFrameAtRef.current >= FRAME_CAPTURE_MS) {
          const frame = captureFrame();
          if (frame) {
            rollingFramesRef.current = [...rollingFramesRef.current, frame].slice(-MAX_SEGMENT_FRAMES);
          }
          lastFrameAtRef.current = now;
        }

        metricsHistoryRef.current = [...metricsHistoryRef.current, metrics].slice(-80);
        const detected = detectLocalGesture(challenge, metricsHistoryRef.current);
        const enoughFrames = rollingFramesRef.current.length >= MIN_SEGMENT_FRAMES;

        if (detected && enoughFrames) {
          void confirmSegment(challenge, rollingFramesRef.current.slice(-MAX_SEGMENT_FRAMES));
        } else if (now - challengeStartedAtRef.current > HELP_AFTER_MS) {
          setStatusMessage(challengeLabel(challenge).help);
        }
      }
    }

    rafRef.current = requestAnimationFrame(liveLoop);
  }, [analyzeFrame, captureFrame, challengeIndex, confirmSegment, order, phase]);

  const startCameraAndModel = useCallback(async () => {
    try {
      if (!window.isSecureContext) {
        setError(
          "La caméra mobile exige HTTPS. Ouvrez l'app avec https://192.168.2.218:1420 puis acceptez le certificat local.",
        );
        return;
      }
      setPhase('loading');
      setStatusMessage('Initialisation caméra...');
      stopStream();
      await delay(1_200);
      const mediaStream = await openUserCameraWithRetry();
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => undefined);
      }

      setStatusMessage('Chargement MediaPipe...');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: '/mediapipe/models/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 2,
      });

      setPhase('environment');
      setStatusMessage('Placez votre visage face à la caméra.');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError("Permission caméra refusée. Autorisez la caméra dans le navigateur puis rechargez la page.");
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        setError("La caméra est occupée par une autre vue. Fermez les autres onglets caméra puis réessayez.");
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError("Aucune caméra frontale disponible sur cet appareil.");
      } else {
        setError(err instanceof Error ? err.message : "Impossible d'accéder à la caméra. Utilisez HTTPS sur téléphone.");
      }
    }
  }, [stopStream]);

  useEffect(() => {
    void startCameraAndModel();
    return () => {
      stopLoop();
      stopStream();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [startCameraAndModel, stopLoop, stopStream]);

  useEffect(() => {
    stopLoop();
    if (phase === 'environment' || phase === 'challenge') {
      rafRef.current = requestAnimationFrame(liveLoop);
    }
    return stopLoop;
  }, [liveLoop, phase, stopLoop]);

  const handleCancel = () => {
    stopLoop();
    stopStream();
    onCancel();
  };

  const currentChallenge = challengeLabel(order[challengeIndex] ?? 'blink');
  const CurrentIcon = currentChallenge.icon;
  const ConfirmedIcon = confirmedKey ? challengeLabel(confirmedKey).icon : CheckCircle2;

  return (
    <div className="relative flex h-[430px] w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-black">
      {error ? (
        <div className="p-6 text-center text-white">
          <p className="mb-4 text-red-400">{error}</p>
          <Button variant="secondary" onClick={startCameraAndModel}>
            <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
          </Button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />

          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="relative z-20 h-[65%] w-[60%] rounded-[100%] border-2 border-dashed border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>

          <div className="absolute top-4 z-20 w-full px-4 text-center">
            <div className="inline-flex max-w-[92%] flex-col items-center gap-2 rounded-xl bg-black/70 px-4 py-3">
              {phase === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              {phase === 'environment' && <ShieldCheck className="h-5 w-5 text-primary" />}
              {phase === 'challenge' && <CurrentIcon className="h-5 w-5 text-primary" />}
              {phase === 'confirming' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              {phase === 'confirmed' && <ConfirmedIcon className="h-5 w-5 text-emerald-400" />}

              <div className="font-semibold text-white">
                {phase === 'environment' && 'Vérification environnement'}
                {phase === 'challenge' && `${challengeIndex + 1}/${order.length} - ${currentChallenge.label}`}
                {phase === 'confirming' && 'Confirmation serveur'}
                {phase === 'confirmed' && 'Geste confirmé'}
                {phase === 'loading' && 'Préparation'}
              </div>
              <p className="text-sm text-white/82">{statusMessage}</p>

              {showDebug && lastMetrics && (
                <div className="grid grid-cols-4 gap-2 text-[11px] text-white/70">
                  <span>Luma {Math.round(lastMetrics.luminance)}</span>
                  <span>EAR {lastMetrics.ear.toFixed(3)}</span>
                  <span>MAR {lastMetrics.mar.toFixed(3)}</span>
                  <span>Face {lastMetrics.faceCount}</span>
                </div>
              )}
            </div>
          </div>

          {showDebug && serverDebug && (
            <div className="absolute bottom-20 z-20 max-w-[92%] rounded-lg bg-black/70 px-3 py-2 text-[10px] text-white/70">
              {serverDebug}
            </div>
          )}

          <div className="absolute bottom-6 z-20 flex w-full items-center justify-center gap-6">
            <Button
              size="icon"
              variant="destructive"
              className="h-12 w-12 rounded-full opacity-80 hover:opacity-100"
              onClick={handleCancel}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function dataUriToBlob(uri: string): Blob {
  const [meta, b64] = uri.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
