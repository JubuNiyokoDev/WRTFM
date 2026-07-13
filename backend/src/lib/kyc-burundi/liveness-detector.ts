/**
 * Module Liveness & Anti-Spoofing — appelle le microservice Python KYC Vision
 *
 * Raison du pivot : YuNet retourne 12 tenseurs séparés nécessitant un décodage
 * d'ancres + NMS fait en interne par OpenCV C++ — impossible via onnxruntime-node brut.
 * Voir: https://github.com/opencv/opencv_zoo/issues/192
 *
 * Ce module délègue maintenant à backend/kyc-vision-service/ (FastAPI + opencv-python)
 * via HTTP. L'interface publique (checkPassiveLiveness / combineLivenessResults) reste
 * identique — aucun autre module n'est impacté.
 */

import { LivenessResult, BurundiKycError, KYC_ERROR_CODES } from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const KYC_VISION_SERVICE_URL =
  process.env.KYC_VISION_SERVICE_URL ?? "http://127.0.0.1:5010";
const ANTISPOOFING_REAL_THRESHOLD = parseFloat(
  process.env.ANTISPOOFING_REAL_THRESHOLD ?? "0.75",
);
const HTTP_TIMEOUT_MS = 60_000; // 60s — MediaPipe/Paddle peuvent être lents au premier appel

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFACES DES RÉPONSES DU MICROSERVICE
// ═══════════════════════════════════════════════════════════════════════════════

interface DetectFaceResponse {
  detected: boolean;
  box: { x: number; y: number; width: number; height: number } | null;
  landmarks: Array<{ x: number; y: number }> | null;
  confidence: number;
}

interface AntiSpoofingResponse {
  is_real_face: boolean;
  score: number;
  prob_print_attack: number;
  prob_replay_attack: number;
  error?: string;
}

interface ActiveLivenessResponse {
  blinkDetected?: boolean;
  headTurnDetected?: boolean;
  mouthMovementDetected?: boolean;
  eye_blink: boolean;
  head_turn: boolean;
  mouth_movement: boolean;
  framesTotal?: number;
  framesWithFace?: number;
  frames_total?: number;
  frames_with_face?: number;
  maxEarDrop?: number;
  earDropRatio?: number;
  maxYawChangeDegrees?: number;
  maxMarVariation?: number;
  measures?: {
    maxEarDrop?: number;
    earDropRatio?: number;
    maxYawChangeDegrees?: number;
    maxMarVariation?: number;
  };
  series?: {
    ear?: number[];
    yawDegrees?: number[];
    mar?: number[];
  };
  reason?: string;
}

export interface ActiveLivenessCheck {
  tests: {
    eyeBlink: boolean;
    headTurn: boolean;
    mouthMovement: boolean;
  };
  framesTotal: number;
  framesWithFace: number;
  measures?: {
    maxEarDrop?: number;
    earDropRatio?: number;
    maxYawChangeDegrees?: number;
    maxMarVariation?: number;
  };
  series?: {
    ear?: number[];
    yawDegrees?: number[];
    mar?: number[];
  };
  reason?: string;
  segments?: Record<string, ActiveLivenessSegmentCheck>;
  order?: ActiveLivenessChallenge[];
}

export type ActiveLivenessChallenge = "blink" | "head_turn" | "mouth";

export interface ActiveLivenessSegmentCheck {
  expectedChallenge: ActiveLivenessChallenge;
  passed: boolean;
  tests: {
    eyeBlink: boolean;
    headTurn: boolean;
    mouthMovement: boolean;
  };
  framesTotal: number;
  framesWithFace: number;
  measures: {
    maxEarDrop?: number;
    earDropRatio?: number;
    maxYawChangeDegrees?: number;
    maxMarVariation?: number;
  };
  series?: {
    ear?: number[];
    yawDegrees?: number[];
    mar?: number[];
  };
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS HTTP
// ═══════════════════════════════════════════════════════════════════════════════

async function postImageToService<T>(
  endpoint: string,
  imageBuffer: Buffer,
  filename = "image.jpg",
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
    formData.append("image", blob, filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(`${KYC_VISION_SERVICE_URL}${endpoint}`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new BurundiKycError(
          `KYC Vision Service erreur ${response.status}: ${errorText}`,
          KYC_ERROR_CODES.FACE_NOT_DETECTED,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BurundiKycError) throw error;
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < 2 && (msg.includes("fetch") || msg.includes("ECONNRESET"))) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new BurundiKycError(
    `KYC Vision Service inaccessible (${KYC_VISION_SERVICE_URL}): ${msg}. Lancez: cd backend/kyc-vision-service && uvicorn main:app --port 5010`,
    KYC_ERROR_CODES.MODEL_LOAD_FAILED,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE LIVENESS DETECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export class LivenessDetector {
  /**
   * Vérifie si le microservice est accessible
   */
  async checkHealth(): Promise<boolean> {
    try {
      const resp = await fetch(`${KYC_VISION_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * Détecte le visage principal dans une image.
   * Délègue au microservice Python (cv2.FaceDetectorYN — vrai wrapper OpenCV pour YuNet).
   */
  async detectFace(
    imageBuffer: Buffer,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const result = await postImageToService<DetectFaceResponse>(
      "/detect-face",
      imageBuffer,
    );

    if (!result.detected || !result.box) {
      return null;
    }

    return {
      x: result.box.x,
      y: result.box.y,
      width: result.box.width,
      height: result.box.height,
    };
  }

  /**
   * Vérifie le liveness passif (anti-spoofing) d'un selfie.
   * Délègue au microservice Python (MiniFASNetV2 via ONNX Runtime Python).
   */
  async checkPassiveLiveness(
    selfieBuffer: Buffer,
  ): Promise<Pick<LivenessResult, "antiSpoofing">> {
    const result = await postImageToService<AntiSpoofingResponse>(
      "/anti-spoofing",
      selfieBuffer,
    );

    if (result.error && !result.is_real_face && result.score === 0) {
      throw new BurundiKycError(
        `Aucun visage détecté dans le selfie: ${result.error}`,
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }

    return {
      antiSpoofing: {
        score: result.score,
        isRealFace: result.is_real_face,
      },
    };
  }

  /**
   * Vérifie les défis de liveness actif côté serveur à partir des frames
   * capturées pendant les instructions (tourner la tête, cligner, bouche).
   * Les booléens du client ne sont jamais crus sur parole.
   */
  async checkActiveLiveness(frames: Buffer[]): Promise<ActiveLivenessCheck> {
    if (frames.length < 15) {
      throw new BurundiKycError(
        `Au moins 15 frames requises pour le liveness actif serveur (reçu: ${frames.length})`,
        KYC_ERROR_CODES.LIVENESS_FAILED,
      );
    }
    if (frames.length > 30) {
      throw new BurundiKycError(
        `Maximum 30 frames pour le liveness actif serveur (reçu: ${frames.length})`,
        KYC_ERROR_CODES.LIVENESS_FAILED,
      );
    }

    const formData = new FormData();
    frames.forEach((frame, index) => {
      const blob = new Blob([new Uint8Array(frame)], { type: "image/jpeg" });
      formData.append("frames", blob, `frame-${index}.jpg`);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${KYC_VISION_SERVICE_URL}/verify-active-liveness`,
        { method: "POST", body: formData, signal: controller.signal },
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new BurundiKycError(
          `KYC Vision Service /verify-active-liveness erreur ${response.status}: ${errorText}`,
          KYC_ERROR_CODES.LIVENESS_FAILED,
        );
      }
      const result = (await response.json()) as ActiveLivenessResponse;
      const framesTotal = result.framesTotal ?? result.frames_total ?? frames.length;
      const framesWithFace = result.framesWithFace ?? result.frames_with_face ?? 0;
      return {
        tests: {
          eyeBlink: result.blinkDetected ?? result.eye_blink,
          headTurn: result.headTurnDetected ?? result.head_turn,
          mouthMovement: result.mouthMovementDetected ?? result.mouth_movement,
        },
        framesTotal,
        framesWithFace,
        measures: {
          maxEarDrop: result.measures?.maxEarDrop ?? result.maxEarDrop,
          earDropRatio: result.measures?.earDropRatio ?? result.earDropRatio,
          maxYawChangeDegrees:
            result.measures?.maxYawChangeDegrees ?? result.maxYawChangeDegrees,
          maxMarVariation:
            result.measures?.maxMarVariation ?? result.maxMarVariation,
        },
        series: result.series,
        reason: result.reason,
      };
    } catch (error) {
      if (error instanceof BurundiKycError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new BurundiKycError(
        `KYC Vision Service inaccessible pour /verify-active-liveness: ${msg}`,
        KYC_ERROR_CODES.MODEL_LOAD_FAILED,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkActiveLivenessSegment(
    expectedChallenge: ActiveLivenessChallenge,
    frames: Buffer[],
  ): Promise<ActiveLivenessSegmentCheck> {
    if (frames.length < 5 || frames.length > 8) {
      throw new BurundiKycError(
        `Segment ${expectedChallenge}: 5 à 8 frames requises (reçu: ${frames.length})`,
        KYC_ERROR_CODES.LIVENESS_FAILED,
      );
    }

    const formData = new FormData();
    formData.append("expectedChallenge", expectedChallenge);
    frames.forEach((frame, index) => {
      const blob = new Blob([new Uint8Array(frame)], { type: "image/jpeg" });
      formData.append("frames", blob, `${expectedChallenge}-${index}.jpg`);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${KYC_VISION_SERVICE_URL}/verify-active-liveness-segment`,
        { method: "POST", body: formData, signal: controller.signal },
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new BurundiKycError(
          `KYC Vision Service /verify-active-liveness-segment erreur ${response.status}: ${errorText}`,
          KYC_ERROR_CODES.LIVENESS_FAILED,
        );
      }
      const result = (await response.json()) as ActiveLivenessResponse & {
        expectedChallenge: ActiveLivenessChallenge;
        passed: boolean;
      };
      return {
        expectedChallenge,
        passed: result.passed,
        tests: {
          eyeBlink: result.blinkDetected ?? result.eye_blink,
          headTurn: result.headTurnDetected ?? result.head_turn,
          mouthMovement: result.mouthMovementDetected ?? result.mouth_movement,
        },
        framesTotal: result.framesTotal ?? result.frames_total ?? frames.length,
        framesWithFace: result.framesWithFace ?? result.frames_with_face ?? 0,
        measures: {
          maxEarDrop: result.measures?.maxEarDrop ?? result.maxEarDrop,
          earDropRatio: result.measures?.earDropRatio ?? result.earDropRatio,
          maxYawChangeDegrees:
            result.measures?.maxYawChangeDegrees ?? result.maxYawChangeDegrees,
          maxMarVariation:
            result.measures?.maxMarVariation ?? result.maxMarVariation,
        },
        series: result.series,
        reason: result.reason,
      };
    } catch (error) {
      if (error instanceof BurundiKycError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new BurundiKycError(
        `KYC Vision Service inaccessible pour /verify-active-liveness-segment: ${msg}`,
        KYC_ERROR_CODES.MODEL_LOAD_FAILED,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkActiveLivenessSequence(
    order: ActiveLivenessChallenge[],
    segments: Record<ActiveLivenessChallenge, Buffer[]>,
  ): Promise<ActiveLivenessCheck> {
    const checks: Record<string, ActiveLivenessSegmentCheck> = {};
    for (const challenge of order) {
      checks[challenge] = await this.checkActiveLivenessSegment(
        challenge,
        segments[challenge] ?? [],
      );
    }

    const blink = checks.blink;
    const headTurn = checks.head_turn;
    const mouth = checks.mouth;
    const framesTotal = Object.values(checks).reduce((sum, check) => sum + check.framesTotal, 0);
    const framesWithFace = Object.values(checks).reduce((sum, check) => sum + check.framesWithFace, 0);

    return {
      tests: {
        eyeBlink: Boolean(blink?.passed),
        headTurn: Boolean(headTurn?.passed),
        mouthMovement: Boolean(mouth?.passed),
      },
      framesTotal,
      framesWithFace,
      measures: {
        maxEarDrop: blink?.measures.maxEarDrop,
        earDropRatio: blink?.measures.earDropRatio,
        maxYawChangeDegrees: headTurn?.measures.maxYawChangeDegrees,
        maxMarVariation: mouth?.measures.maxMarVariation,
      },
      reason: Object.values(checks).find((check) => !check.passed)?.reason,
      segments: checks,
      order,
    };
  }

  /**
   * Intègre les résultats du liveness actif serveur et passif.
   * Interface inchangée — appelé par engine.ts et sse-engine.ts.
   */
  combineLivenessResults(
    activeLivenessData: {
      eyeBlink: boolean;
      headTurn: boolean;
      mouthMovement: boolean;
    },
    passiveLivenessResult: Pick<LivenessResult, "antiSpoofing">,
  ): LivenessResult {
    const activeTestsPassed =
      activeLivenessData.eyeBlink &&
      activeLivenessData.headTurn &&
      activeLivenessData.mouthMovement;
    const passiveTestPassed = passiveLivenessResult.antiSpoofing.isRealFace;

    // Confiance basée sur combinaison des tests
    let confidence = 0;
    if (passiveTestPassed) {
      confidence = passiveLivenessResult.antiSpoofing.score * 100;
      if (activeTestsPassed) {
        confidence = Math.min(confidence + 15, 100);
      }
    }

    return {
      isLive: activeTestsPassed && passiveTestPassed,
      confidence: Math.round(confidence),
      tests: activeLivenessData,
      antiSpoofing: passiveLivenessResult.antiSpoofing,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANCE GLOBALE ET EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const livenessDetector = new LivenessDetector();

export async function checkPassiveLiveness(
  selfieBuffer: Buffer,
): Promise<Pick<LivenessResult, "antiSpoofing">> {
  return livenessDetector.checkPassiveLiveness(selfieBuffer);
}
