import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Focus, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react';

interface CameraCaptureProps {
  mode: 'id' | 'selfie';
  documentSide?: 'front' | 'back';
  onCapture: (base64Image: string) => void;
  onCancel: () => void;
}

interface ScanMetrics {
  luminance: number;
  sharpness: number;
  edgeDensity: number;
  cornerScore: number;
  borderEdgeDensity: number;
  documentCoverage: number;
  documentFillRatio: number;
  documentMarginLeft: number;
  documentMarginRight: number;
  documentMarginTop: number;
  documentMarginBottom: number;
  documentAspectRatio: number;
  overexposedRatio: number;
  underexposedRatio: number;
  width: number;
  height: number;
}

const ANALYSIS_WIDTH = 420;
const READY_FRAMES_REQUIRED = 22;
const MIN_CAMERA_WIDTH = 900;
const MIN_LUMA = 62;
const MAX_LUMA = 205;
const MIN_SHARPNESS = 7;
const MIN_EDGE_DENSITY = 0.045;
const MIN_CORNER_SCORE = 0.008;
const MAX_BORDER_EDGE_DENSITY = 0.16;
const MIN_DOCUMENT_COVERAGE = 0.28;
const MAX_DOCUMENT_COVERAGE = 0.88;
const MIN_DOCUMENT_FILL_RATIO = 0.32;
const MIN_DOCUMENT_MARGIN = 0.025;
const MIN_DOCUMENT_ASPECT = 1.15;
const MAX_DOCUMENT_ASPECT = 3.1;
const MAX_OVEREXPOSED = 0.14;
const MAX_UNDEREXPOSED = 0.16;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function openCameraWithRetry(mode: 'id' | 'selfie'): Promise<MediaStream> {
  const facingMode = mode === 'id' ? 'environment' : 'user';
  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    {
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
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
        await delay(1_100);
        continue;
      }
      if (index < attempts.length - 1) {
        await delay(400);
        continue;
      }
    }
  }

  throw lastError;
}

function getDataUri(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.9);
}

function getTargetRect(width: number, height: number) {
  return {
    x: Math.round(width * 0.1),
    y: Math.round(height * 0.225),
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.55),
  };
}

interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampRect(rect: SourceRect, video: HTMLVideoElement): SourceRect {
  const x = Math.max(0, Math.min(video.videoWidth - 1, rect.x));
  const y = Math.max(0, Math.min(video.videoHeight - 1, rect.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(video.videoWidth - x, rect.width)),
    height: Math.max(1, Math.min(video.videoHeight - y, rect.height)),
  };
}

function getVisibleFrameSourceRect(
  video: HTMLVideoElement,
  frame: HTMLElement | null,
  padRatio = 0,
): SourceRect {
  if (!frame) return getTargetRect(video.videoWidth, video.videoHeight);

  const videoRect = video.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  if (
    video.videoWidth <= 0 ||
    video.videoHeight <= 0 ||
    videoRect.width <= 0 ||
    videoRect.height <= 0
  ) {
    return getTargetRect(video.videoWidth, video.videoHeight);
  }

  const scale = Math.max(
    videoRect.width / video.videoWidth,
    videoRect.height / video.videoHeight,
  );
  const renderedWidth = video.videoWidth * scale;
  const renderedHeight = video.videoHeight * scale;
  const offsetX = (videoRect.width - renderedWidth) / 2;
  const offsetY = (videoRect.height - renderedHeight) / 2;

  const frameX = frameRect.left - videoRect.left;
  const frameY = frameRect.top - videoRect.top;
  const padX = frameRect.width * padRatio;
  const padY = frameRect.height * padRatio;

  return clampRect(
    {
      x: (frameX - padX - offsetX) / scale,
      y: (frameY - padY - offsetY) / scale,
      width: (frameRect.width + padX * 2) / scale,
      height: (frameRect.height + padY * 2) / scale,
    },
    video,
  );
}

function analyzeDocumentFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  frame: HTMLElement | null,
): ScanMetrics | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  const source = getVisibleFrameSourceRect(video, frame, 0.03);
  const scale = ANALYSIS_WIDTH / source.width;
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(
    video,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const gray = new Uint8Array(width * height);
  let lumaSum = 0;
  let over = 0;
  let under = 0;

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel++) {
    const value = Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
    gray[pixel] = value;
    lumaSum += value;
    if (value > 242) over++;
    if (value < 22) under++;
  }

  let edgeCount = 0;
  let sharpnessSum = 0;
  let cornerEdgeCount = 0;
  let cornerPixelCount = 0;
  let borderEdgeCount = 0;
  let borderPixelCount = 0;
  let documentPixelCount = 0;
  let docMinX = width;
  let docMinY = height;
  let docMaxX = 0;
  let docMaxY = 0;
  const cornerW = Math.max(18, Math.round(width * 0.18));
  const cornerH = Math.max(18, Math.round(height * 0.22));
  const borderW = Math.max(12, Math.round(width * 0.08));
  const borderH = Math.max(12, Math.round(height * 0.08));

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const dataIndex = idx * 4;
      const red = data[dataIndex];
      const green = data[dataIndex + 1];
      const blue = data[dataIndex + 2];
      const luma = gray[idx];
      const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const gy = Math.abs(gray[idx + width] - gray[idx - width]);
      const gradient = gx + gy;
      sharpnessSum += gradient;
      const isEdge = gradient > 42;
      if (isEdge) edgeCount++;

      const inCorner =
        (x < cornerW || x > width - cornerW) &&
        (y < cornerH || y > height - cornerH);
      if (inCorner) {
        cornerPixelCount++;
        if (isEdge) cornerEdgeCount++;
      }

      const inBorder =
        x < borderW ||
        x > width - borderW ||
        y < borderH ||
        y > height - borderH;
      if (inBorder) {
        borderPixelCount++;
        if (isEdge) borderEdgeCount++;
      }

      // Burundi paper IDs in our target generation are blue/cyan paper booklets.
      // This mask is intentionally used only for live framing guidance; the server
      // still validates the official template by OCR.
      const bluePaper =
        luma > 45 &&
        blue > red + 8 &&
        green > red - 8 &&
        blue + green > red * 1.75;
      const paleDocument =
        luma > 85 &&
        Math.abs(blue - green) < 36 &&
        blue > red + 2 &&
        gradient > 18;
      if (bluePaper || paleDocument) {
        documentPixelCount++;
        if (x < docMinX) docMinX = x;
        if (x > docMaxX) docMaxX = x;
        if (y < docMinY) docMinY = y;
        if (y > docMaxY) docMaxY = y;
      }
    }
  }

  const pixelCount = width * height;
  const hasDocument = documentPixelCount > pixelCount * 0.03;
  const docWidth = hasDocument ? docMaxX - docMinX + 1 : 0;
  const docHeight = hasDocument ? docMaxY - docMinY + 1 : 0;
  const docArea = docWidth * docHeight;
  return {
    luminance: lumaSum / pixelCount,
    sharpness: sharpnessSum / pixelCount,
    edgeDensity: edgeCount / pixelCount,
    cornerScore: cornerPixelCount > 0 ? cornerEdgeCount / cornerPixelCount : 0,
    borderEdgeDensity: borderPixelCount > 0 ? borderEdgeCount / borderPixelCount : 0,
    documentCoverage: docArea / pixelCount,
    documentFillRatio: docArea > 0 ? documentPixelCount / docArea : 0,
    documentMarginLeft: hasDocument ? docMinX / width : 1,
    documentMarginRight: hasDocument ? (width - docMaxX - 1) / width : 1,
    documentMarginTop: hasDocument ? docMinY / height : 1,
    documentMarginBottom: hasDocument ? (height - docMaxY - 1) / height : 1,
    documentAspectRatio: docHeight > 0 ? docWidth / docHeight : 0,
    overexposedRatio: over / pixelCount,
    underexposedRatio: under / pixelCount,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

function readiness(metrics: ScanMetrics | null) {
  if (!metrics) return { ready: false, message: 'Initialisation de la caméra...', reason: 'loading' };
  if (metrics.width < MIN_CAMERA_WIDTH) {
    return {
      ready: false,
      message: 'Utilisez la caméra arrière ou rapprochez la carte pour plus de détails.',
      reason: 'resolution',
    };
  }
  if (metrics.luminance < MIN_LUMA || metrics.underexposedRatio > MAX_UNDEREXPOSED) {
    return { ready: false, message: "Améliorez l'éclairage, la carte est trop sombre.", reason: 'dark' };
  }
  if (metrics.luminance > MAX_LUMA || metrics.overexposedRatio > MAX_OVEREXPOSED) {
    return { ready: false, message: 'Évitez les reflets directs sur la carte.', reason: 'glare' };
  }
  if (metrics.sharpness < MIN_SHARPNESS) {
    return { ready: false, message: 'Stabilisez légèrement la carte, puis gardez-la immobile.', reason: 'blur' };
  }
  if (metrics.documentCoverage < MIN_DOCUMENT_COVERAGE || metrics.documentFillRatio < MIN_DOCUMENT_FILL_RATIO) {
    return {
      ready: false,
      message: 'Placez la carte complète dans le cadre: document non détecté entièrement.',
      reason: 'document_missing',
    };
  }
  if (metrics.documentCoverage > MAX_DOCUMENT_COVERAGE) {
    return {
      ready: false,
      message: 'Reculez un peu: la carte est trop proche du cadre.',
      reason: 'document_too_close',
    };
  }
  if (
    metrics.documentMarginLeft < MIN_DOCUMENT_MARGIN ||
    metrics.documentMarginRight < MIN_DOCUMENT_MARGIN ||
    metrics.documentMarginTop < MIN_DOCUMENT_MARGIN ||
    metrics.documentMarginBottom < MIN_DOCUMENT_MARGIN
  ) {
    return {
      ready: false,
      message: 'Les 4 bords doivent rester visibles: reculez ou recentrez la carte.',
      reason: 'document_cut',
    };
  }
  if (
    metrics.documentAspectRatio < MIN_DOCUMENT_ASPECT ||
    metrics.documentAspectRatio > MAX_DOCUMENT_ASPECT
  ) {
    return {
      ready: false,
      message: 'Orientez la carte horizontalement et montrez le document complet.',
      reason: 'document_shape',
    };
  }
  if (metrics.edgeDensity < MIN_EDGE_DENSITY) {
    return { ready: false, message: 'Rapprochez un peu la carte: le texte doit être lisible dans le cadre.', reason: 'not_document' };
  }
  if (metrics.cornerScore < MIN_CORNER_SCORE) {
    return { ready: false, message: 'Alignez la carte dans le cadre: gardez les 4 coins visibles.', reason: 'corners' };
  }
  if (metrics.borderEdgeDensity > MAX_BORDER_EDGE_DENSITY) {
    return {
      ready: false,
      message: 'Reculez un peu: toute la carte doit rester à l’intérieur du cadre.',
      reason: 'touching_edges',
    };
  }
  return { ready: true, message: 'Carte détectée: scan en cours, ne bougez pas.', reason: 'ready' };
}

export function CameraCapture({ mode, documentSide = 'front', onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanFrameRef = useRef<HTMLDivElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const readyFramesRef = useRef(0);
  const capturedRef = useRef(false);
  const validatingRef = useRef(false);
  const needsRetryRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ScanMetrics | null>(null);
  const [status, setStatus] = useState('Initialisation caméra...');
  const [isValidatingTemplate, setIsValidatingTemplate] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureFullFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (mode === 'selfie') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return getDataUri(canvas);
  }, [mode]);

  const captureDocumentFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    const source = getVisibleFrameSourceRect(video, scanFrameRef.current, 0.08);
    canvas.width = Math.round(source.width);
    canvas.height = Math.round(source.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      video,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return getDataUri(canvas);
  }, []);

  const acceptCapture = useCallback((dataUri: string) => {
    capturedRef.current = true;
    stopCamera();
    window.setTimeout(() => onCapture(dataUri), 900);
  }, [onCapture, stopCamera]);

  const validateAndCaptureDocument = useCallback(async (dataUri: string) => {
    if (validatingRef.current || capturedRef.current) return;
    validatingRef.current = true;
    needsRetryRef.current = false;
    setIsValidatingTemplate(true);
    setNeedsRetry(false);
    setStatus('Validation du vrai modèle de carte burundaise...');
    const token =
      localStorage.getItem('wrtfm_token') ??
      localStorage.getItem('cae_token');

    try {
      const response = await fetch('/api/users/me/kyc/document-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          side: documentSide ?? 'front',
          imageData: dataUri,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.isValid) {
        setStatus(
          `${documentSide === 'back' ? 'Verso' : 'Recto'} confirmé: ${result.anchorsFound?.join(', ') || 'ancres trouvées'}`,
        );
        acceptCapture(dataUri);
        return;
      }

      readyFramesRef.current = 0;
      const label = documentSide === 'back' ? 'verso' : 'recto';
      const anchors = Array.isArray(result?.anchorsFound) && result.anchorsFound.length
        ? ` Ancres vues: ${result.anchorsFound.join(', ')}.`
        : '';
      needsRetryRef.current = true;
      setNeedsRetry(true);
      setStatus(
        `Montrez le ${label} complet: les 4 coins, la photo, l'empreinte et les zones de texte doivent rester visibles.${anchors}`,
      );
    } catch (validationError) {
      readyFramesRef.current = 0;
      needsRetryRef.current = true;
      setNeedsRetry(true);
      setStatus(
        validationError instanceof Error
          ? validationError.message
          : 'Validation serveur de la carte indisponible.',
      );
    } finally {
      validatingRef.current = false;
      setIsValidatingTemplate(false);
    }
  }, [acceptCapture, documentSide]);

  const analyzeLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = analysisCanvasRef.current ?? document.createElement('canvas');
    analysisCanvasRef.current = canvas;

    if (mode === 'id' && video && !needsRetryRef.current && !validatingRef.current) {
      const nextMetrics = analyzeDocumentFrame(video, canvas, scanFrameRef.current);
      const nextState = readiness(nextMetrics);
      setMetrics(nextMetrics);
      setStatus(nextState.message);

      if (nextState.ready) {
        readyFramesRef.current += 1;
        setStatus(
          readyFramesRef.current >= Math.floor(READY_FRAMES_REQUIRED * 0.55)
            ? 'Scan du template en cours: gardez la carte immobile.'
            : nextState.message,
        );
        if (
          readyFramesRef.current >= READY_FRAMES_REQUIRED &&
          !capturedRef.current &&
          !validatingRef.current
        ) {
          const candidate = captureDocumentFrame() ?? captureFullFrame();
          if (candidate) void validateAndCaptureDocument(candidate);
        }
      } else {
        readyFramesRef.current = 0;
      }
    }

    rafRef.current = requestAnimationFrame(analyzeLoop);
  }, [captureDocumentFrame, captureFullFrame, mode, validateAndCaptureDocument]);

  const startCamera = useCallback(async () => {
    try {
      if (!window.isSecureContext) {
        setError(
          "La caméra mobile exige HTTPS. Ouvrez l'app avec https://192.168.2.218:1420 puis acceptez le certificat local.",
        );
        return;
      }
      capturedRef.current = false;
      validatingRef.current = false;
      needsRetryRef.current = false;
      readyFramesRef.current = 0;
      setIsValidatingTemplate(false);
      setNeedsRetry(false);
      setStatus('Initialisation caméra...');
      stopCamera();
      await delay(450);
      const mediaStream = await openCameraWithRetry(mode);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => undefined);
      }
      setError(null);
      rafRef.current = requestAnimationFrame(analyzeLoop);
    } catch (cameraError) {
      const name = cameraError instanceof DOMException ? cameraError.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError("Permission caméra refusée. Autorisez la caméra dans le navigateur puis rechargez la page.");
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        setError("La caméra est occupée ou n'a pas fini de se libérer. Fermez les autres onglets caméra puis réessayez.");
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError("Aucune caméra disponible sur cet appareil.");
      } else {
        setError("Impossible d'accéder à la caméra. Sur téléphone, utilisez HTTPS et vérifiez les permissions.");
      }
    }
  }, [analyzeLoop, mode]);

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const progress = isValidatingTemplate
    ? 100
    : Math.min(100, Math.round((readyFramesRef.current / READY_FRAMES_REQUIRED) * 100));
  const state = readiness(metrics);
  const retrySameStep = () => {
    readyFramesRef.current = 0;
    validatingRef.current = false;
    needsRetryRef.current = false;
    setIsValidatingTemplate(false);
    setNeedsRetry(false);
    setStatus(documentSide === 'back'
      ? 'Replacez le verso complet dans le cadre.'
      : 'Replacez le recto complet dans le cadre.');
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(analyzeLoop);
    }
  };

  return (
    <div className="relative flex h-[min(430px,72vh)] w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-black">
      {error ? (
        <div className="p-6 text-center text-white">
          <p className="mb-4 text-red-400">{error}</p>
          <Button variant="secondary" onClick={startCamera}>
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
            className={`h-full w-full object-cover ${mode === 'selfie' ? '-scale-x-100' : ''}`}
          />

          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" />
            <div
              ref={scanFrameRef}
              className={`relative z-20 border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-colors ${
                state.ready ? 'border-emerald-400' : 'border-primary'
              } ${mode === 'id' ? 'h-[55%] w-[80%] rounded-xl' : 'h-[65%] w-[60%] rounded-[100%]'}`}
            >
              {mode === 'id' && (
                <>
                  <div className="absolute -left-1 -top-1 h-7 w-7 rounded-tl-lg border-l-4 border-t-4 border-current" />
                  <div className="absolute -right-1 -top-1 h-7 w-7 rounded-tr-lg border-r-4 border-t-4 border-current" />
                  <div className="absolute -bottom-1 -left-1 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 border-current" />
                  <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-br-lg border-b-4 border-r-4 border-current" />
                </>
              )}
            </div>
          </div>

          <div className="absolute top-3 z-20 w-full px-3 text-center">
            <div className="inline-flex max-w-[94%] flex-col items-center gap-1.5 rounded-xl bg-black/66 px-3 py-2 text-white">
              {isValidatingTemplate ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : needsRetry ? (
                <RefreshCw className="h-5 w-5 text-amber-300" />
              ) : state.ready ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : state.reason === 'blur' ? (
                <Focus className="h-5 w-5 text-amber-300" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-primary" />
              )}
              <p className="text-sm font-semibold">
                {mode === 'id' ? 'Capture automatique de la carte' : 'Capture visage'}
              </p>
              <p className="text-[11px] leading-snug text-white/85">{status}</p>
              {mode === 'id' && (
                <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
              {metrics && mode === 'id' && (
                <div className="grid grid-cols-6 gap-1.5 text-[9px] text-white/65">
                  <span>Luma {Math.round(metrics.luminance)}</span>
                  <span>Net {metrics.sharpness.toFixed(1)}</span>
                  <span>Bords {Math.round(metrics.edgeDensity * 100)}</span>
                  <span>Coins {Math.round(metrics.cornerScore * 100)}</span>
                  <span>Doc {Math.round(metrics.documentCoverage * 100)}</span>
                  <span>Marge {Math.round(Math.min(
                    metrics.documentMarginLeft,
                    metrics.documentMarginRight,
                    metrics.documentMarginTop,
                    metrics.documentMarginBottom,
                  ) * 100)}</span>
                </div>
              )}
            </div>
          </div>

          {needsRetry && (
            <div className="absolute bottom-24 right-4 z-30">
              <Button
                type="button"
                size="icon"
                aria-label="Réessayer cette étape"
                title="Réessayer cette étape"
                className="h-12 w-12 rounded-full bg-amber-400 text-black shadow-lg hover:bg-amber-300"
                onClick={retrySameStep}
              >
                <RefreshCw className="h-5 w-5" />
              </Button>
            </div>
          )}

          <div className="absolute bottom-6 z-20 flex w-full items-center justify-center">
            <Button
              size="icon"
              variant="destructive"
              className="h-12 w-12 rounded-full opacity-85 hover:opacity-100"
              onClick={() => {
                stopCamera();
                onCancel();
              }}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
