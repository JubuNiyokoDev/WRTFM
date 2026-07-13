/**
 * Module de Face Matching avec SFace (OpenCV Zoo)
 * Utilise YuNet pour la détection et SFace pour les embeddings
 * Tous les modèles sous licence Apache 2.0
 */

import * as ort from "onnxruntime-node";
import { Jimp } from "jimp";
import path from "node:path";
import fs from "node:fs/promises";
import {
  FaceMatchingResult,
  BurundiKycError,
  KYC_ERROR_CODES,
  DEFAULT_BURUNDI_KYC_CONFIG,
} from "./types";

// URL du microservice Python pour la détection de visage (YuNet via OpenCV)
const KYC_VISION_SERVICE_URL =
  process.env.KYC_VISION_SERVICE_URL ?? "http://localhost:5010";
const HTTP_TIMEOUT_MS = 30_000;

interface DetectFaceResponse {
  detected: boolean;
  box: { x: number; y: number; width: number; height: number } | null;
  confidence: number;
}

interface FaceMatchResponse {
  matched: boolean;
  similarity: number;
  threshold: number;
  distance: number;
  method: "sface_opencv";
  error?: string;
}

interface FaceEmbeddingResponse {
  detected: boolean;
  embedding: number[];
  method: "sface_opencv";
  error?: string;
}

async function detectFaceViaService(
  imageBuffer: Buffer,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
  formData.append("image", blob, "image.jpg");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${KYC_VISION_SERVICE_URL}/detect-face`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new BurundiKycError(
        `KYC Vision Service /detect-face erreur ${response.status}: ${text}`,
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }

    const result = (await response.json()) as DetectFaceResponse;
    if (!result.detected || !result.box) return null;
    return result.box;
  } catch (error) {
    if (error instanceof BurundiKycError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new BurundiKycError(
      `KYC Vision Service inaccessible pour /detect-face: ${msg}`,
      KYC_ERROR_CODES.MODEL_LOAD_FAILED,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function compareFacesViaService(
  cardPortraitBuffer: Buffer,
  selfieBuffer: Buffer,
): Promise<FaceMatchResponse> {
  const formData = new FormData();
  formData.append(
    "card_image",
    new Blob([new Uint8Array(cardPortraitBuffer)], { type: "image/jpeg" }),
    "card.jpg",
  );
  formData.append(
    "selfie_image",
    new Blob([new Uint8Array(selfieBuffer)], { type: "image/jpeg" }),
    "selfie.jpg",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${KYC_VISION_SERVICE_URL}/face-match`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new BurundiKycError(
        `KYC Vision Service /face-match erreur ${response.status}: ${text}`,
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }

    return (await response.json()) as FaceMatchResponse;
  } catch (error) {
    if (error instanceof BurundiKycError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new BurundiKycError(
      `KYC Vision Service inaccessible pour /face-match: ${msg}`,
      KYC_ERROR_CODES.MODEL_LOAD_FAILED,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractLiveFaceEmbedding(
  imageBuffer: Buffer,
): Promise<number[]> {
  const formData = new FormData();
  formData.append(
    "image",
    new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }),
    "live-face.jpg",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${KYC_VISION_SERVICE_URL}/face-embedding`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new BurundiKycError(
        `KYC Vision Service /face-embedding erreur ${response.status}: ${text}`,
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }

    const result = (await response.json()) as FaceEmbeddingResponse;
    if (!result.detected || result.embedding.length === 0) {
      throw new BurundiKycError(
        result.error ?? "Aucun visage détecté pour embedding live",
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }
    return result.embedding;
  } catch (error) {
    if (error instanceof BurundiKycError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new BurundiKycError(
      `KYC Vision Service inaccessible pour /face-embedding: ${msg}`,
      KYC_ERROR_CODES.MODEL_LOAD_FAILED,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION FACE MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

const FACEMATCH_CONFIG = {
  // Modèles ONNX
  yunetModelPath: path.resolve(
    process.cwd(),
    "models/face_detection_yunet_2023mar.onnx",
  ),
  sfaceModelPath: path.resolve(
    process.cwd(),
    "models/face_recognition_sface_2021dec.onnx",
  ),

  // YuNet config (YuNet 2023mar attend 640x640)
  yunetInputSize: { width: 640, height: 640 },
  yunetScoreThreshold: 0.6,

  // SFace input: (1, 3, 112, 112) RGB float32 normalisé
  sfaceInputSize: { width: 112, height: 112 },

  // Seuil de similarité (cosine similarity)
  similarityThreshold: DEFAULT_BURUNDI_KYC_CONFIG.thresholds.minFaceSimilarity,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE FACE MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

export class FaceMatcher {
  private sfaceSession: ort.InferenceSession | null = null;

  /**
   * Charge uniquement SFace (YuNet délégué au microservice Python)
   */
  async loadModels(): Promise<void> {
    if (this.sfaceSession) {
      return;
    }

    try {
      // Charger uniquement SFace pour les embeddings
      // YuNet est délégué au microservice Python (KYC Vision Service)
      const sfaceExists = await fs
        .access(FACEMATCH_CONFIG.sfaceModelPath)
        .then(() => true)
        .catch(() => false);

      if (!sfaceExists) {
        throw new BurundiKycError(
          `Modèle SFace manquant: ${FACEMATCH_CONFIG.sfaceModelPath}`,
          KYC_ERROR_CODES.MODEL_LOAD_FAILED,
        );
      }

      this.sfaceSession = await ort.InferenceSession.create(
        FACEMATCH_CONFIG.sfaceModelPath,
      );
      console.log("[FaceMatcher] Modèle SFace chargé");
    } catch (error) {
      console.error("[FaceMatcher] Erreur chargement modèles:", error);
      if (error instanceof BurundiKycError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BurundiKycError(
        `Impossible de charger les modèles de reconnaissance faciale: ${errorMessage}`,
        KYC_ERROR_CODES.MODEL_LOAD_FAILED,
      );
    }
  }

  /**
   * Détecte un visage — délégué au microservice Python (cv2.FaceDetectorYN)
   */
  private async detectFace(
    imageBuffer: Buffer,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return detectFaceViaService(imageBuffer);
  }

  /**
   * Génère l'embedding SFace pour un visage
   * SFace attend (1, 3, 112, 112) RGB float32 normalisé mean=[0.485, 0.456, 0.406] std=[0.229, 0.224, 0.225]
   */
  async generateEmbedding(imageBuffer: Buffer): Promise<Float32Array> {
    if (!this.sfaceSession) {
      await this.loadModels();
    }

    // 1. Détecter le visage
    const faceBox = await this.detectFace(imageBuffer);

    if (!faceBox) {
      throw new BurundiKycError(
        "Aucun visage détecté",
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }

    // 2. Extraire et aligner le visage
    const img = await Jimp.read(imageBuffer);

    // Recadrer le visage avec une marge
    const margin = 0.2;
    const cropX = Math.max(0, faceBox.x - faceBox.width * margin);
    const cropY = Math.max(0, faceBox.y - faceBox.height * margin);
    const cropW = Math.min(
      faceBox.width * (1 + 2 * margin),
      img.bitmap.width - cropX,
    );
    const cropH = Math.min(
      faceBox.height * (1 + 2 * margin),
      img.bitmap.height - cropY,
    );

    img.crop({ x: cropX, y: cropY, w: cropW, h: cropH });
    img.resize({
      w: FACEMATCH_CONFIG.sfaceInputSize.width,
      h: FACEMATCH_CONFIG.sfaceInputSize.height,
    });

    // 3. Normaliser selon ImageNet (SFace utilise la normalisation ImageNet)
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    const inputTensor = new Float32Array(
      1 *
        3 *
        FACEMATCH_CONFIG.sfaceInputSize.height *
        FACEMATCH_CONFIG.sfaceInputSize.width,
    );
    const data = img.bitmap.data;

    for (let i = 0; i < FACEMATCH_CONFIG.sfaceInputSize.height; i++) {
      for (let j = 0; j < FACEMATCH_CONFIG.sfaceInputSize.width; j++) {
        const pixelIdx = (i * FACEMATCH_CONFIG.sfaceInputSize.width + j) * 4;
        const tensorIdx = i * FACEMATCH_CONFIG.sfaceInputSize.width + j;

        // RGB normalisé
        inputTensor[
          0 *
            FACEMATCH_CONFIG.sfaceInputSize.height *
            FACEMATCH_CONFIG.sfaceInputSize.width +
            tensorIdx
        ] = (data[pixelIdx] / 255.0 - mean[0]) / std[0];
        inputTensor[
          1 *
            FACEMATCH_CONFIG.sfaceInputSize.height *
            FACEMATCH_CONFIG.sfaceInputSize.width +
            tensorIdx
        ] = (data[pixelIdx + 1] / 255.0 - mean[1]) / std[1];
        inputTensor[
          2 *
            FACEMATCH_CONFIG.sfaceInputSize.height *
            FACEMATCH_CONFIG.sfaceInputSize.width +
            tensorIdx
        ] = (data[pixelIdx + 2] / 255.0 - mean[2]) / std[2];
      }
    }

    const tensor = new ort.Tensor("float32", inputTensor, [
      1,
      3,
      FACEMATCH_CONFIG.sfaceInputSize.height,
      FACEMATCH_CONFIG.sfaceInputSize.width,
    ]);

    // 4. Inférence SFace
    // Le modèle SFace (opencv_zoo) utilise "data" comme nom d'entrée et "fc1" comme sortie
    const results = await this.sfaceSession!.run({ data: tensor });
    // La sortie peut être "fc1" ou "output" selon la version du modèle
    const outputKey = Object.keys(results)[0];
    const embedding = results[outputKey].data as Float32Array;

    return embedding;
  }

  /**
   * Compare deux visages par cosine similarity des embeddings SFace
   */
  async compareFaces(
    cardPortraitBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchingResult> {
    const result = await compareFacesViaService(
      cardPortraitBuffer,
      selfieBuffer,
    );

    if (result.error) {
      throw new BurundiKycError(
        result.error,
        KYC_ERROR_CODES.FACE_NOT_DETECTED,
      );
    }

    console.log("[FaceMatcher] OpenCV SFace similarity:", result.similarity);

    return {
      similarity: result.similarity,
      threshold: result.threshold,
      isMatch: result.matched,
      method: result.method,
      distance: result.distance,
      cardFaceEmbedding: [],
      selfieFaceEmbedding: [],
    };
  }
}

/**
 * Instance globale du comparateur de visages
 */
export const faceMatcher = new FaceMatcher();

/**
 * Fonction utilitaire pour comparaison rapide
 */
export async function compareFacesByEmbeddings(
  cardPortraitBuffer: Buffer,
  selfieBuffer: Buffer,
): Promise<FaceMatchingResult> {
  return faceMatcher.compareFaces(cardPortraitBuffer, selfieBuffer);
}
