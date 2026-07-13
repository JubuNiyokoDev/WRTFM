/**
 * Endpoint de debug (admin-only) pour tester le pipeline KYC burundais
 */

import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "@/middlewares/auth";
import { uploadRateLimit } from "@/middlewares/rate-limit";
import { BurundiKycEngine } from "@/lib/kyc-burundi/engine";
import { BurundiKycSseEngine } from "@/lib/kyc-burundi/sse-engine";
import {
  LivenessDetector,
  type ActiveLivenessChallenge,
} from "@/lib/kyc-burundi/liveness-detector";
import {
  LIVENESS_CHALLENGES,
  confirmLivenessSegment,
  createLivenessSession,
  deleteLivenessSession,
  getLivenessSession,
  parseLivenessOrder,
  selectLiveReferenceFrame,
  validateLivenessSegments,
} from "@/lib/kyc-burundi/liveness-session-store";

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const router: IRouter = Router();
const kycEngine = new BurundiKycEngine();
const livenessDetector = new LivenessDetector();

function collectLivenessSegments(
  files: { [fieldname: string]: Express.Multer.File[] },
) {
  return {
    blink: (files.livenessBlinkFrames ?? []).map((f) => f.buffer),
    head_turn: (files.livenessHeadTurnFrames ?? []).map((f) => f.buffer),
    mouth: (files.livenessMouthFrames ?? []).map((f) => f.buffer),
  } satisfies Record<ActiveLivenessChallenge, Buffer[]>;
}

function sanitizeKycDebugResult<T extends Record<string, any>>(result: T): T {
  if (!result.faceMatching) return result;

  return {
    ...result,
    faceMatching: {
      similarity: result.faceMatching.similarity,
      threshold: result.faceMatching.threshold,
      isMatch: result.faceMatching.isMatch,
      method: result.faceMatching.method,
      distance: result.faceMatching.distance,
      cardFaceEmbedding: [],
      selfieFaceEmbedding: [],
    },
  };
}

// Configurer Multer pour upload en mémoire
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const kycUpload = upload.fields([
  { name: "frontImage", maxCount: 1 },
  { name: "backImage", maxCount: 1 },
  { name: "selfieImage", maxCount: 1 },
  // Frames capturées pendant les défis de liveness actif (vérifiées serveur)
  { name: "livenessFrames", maxCount: 30 },
  { name: "livenessBlinkFrames", maxCount: 8 },
  { name: "livenessHeadTurnFrames", maxCount: 8 },
  { name: "livenessMouthFrames", maxCount: 8 },
]);

const livenessSegmentUpload = upload.fields([
  { name: "frames", maxCount: 8 },
]);

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE DE DEBUG (ADMIN-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  "/admin/kyc-burundi/liveness-session",
  requireAuth,
  requireRole("admin"),
  async (_req, res) => {
    res.json(createLivenessSession());
  },
);

router.post(
  "/admin/kyc-burundi/liveness-segment",
  requireAuth,
  requireRole("admin"),
  uploadRateLimit,
  livenessSegmentUpload,
  async (req, res) => {
    const sessionId =
      typeof req.body?.livenessSessionId === "string"
        ? req.body.livenessSessionId
        : "";
    const expectedChallenge =
      typeof req.body?.expectedChallenge === "string"
        ? (req.body.expectedChallenge as ActiveLivenessChallenge)
        : undefined;
    const session = getLivenessSession(sessionId);

    if (!session || session.expiresAt < Date.now()) {
      res.status(400).json({ error: "Session liveness expirée ou inconnue." });
      return;
    }
    if (!expectedChallenge || !LIVENESS_CHALLENGES.includes(expectedChallenge)) {
      res.status(400).json({ error: "Défi liveness inconnu." });
      return;
    }
    const requiredChallenge = session.order[session.nextIndex];
    if (expectedChallenge !== requiredChallenge) {
      res.status(409).json({
        error: "Défi hors ordre.",
        expectedChallenge: requiredChallenge,
        receivedChallenge: expectedChallenge,
      });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const frames = (files.frames ?? []).map((f) => f.buffer);
    if (frames.length < 5 || frames.length > 8) {
      res.status(400).json({
        error: `Segment ${expectedChallenge}: 5 à 8 frames requises (reçu: ${frames.length}).`,
      });
      return;
    }

    try {
      const result = await livenessDetector.checkActiveLivenessSegment(
        expectedChallenge,
        frames,
      );
      if (result.passed) {
        confirmLivenessSegment(sessionId, expectedChallenge, frames);
      }
      res.json({
        ...result,
        nextChallenge: session.order[session.nextIndex] ?? null,
        confirmed: Array.from(session.confirmed),
      });
    } catch (error) {
      res.status(422).json({
        error:
          error instanceof Error
            ? error.message
            : "Échec vérification segment liveness",
      });
    }
  },
);

// Route GET simplifiée pour test rapide avec les images de référence
router.get("/admin/kyc-burundi/debug-test", async (req, res) => {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    // Charger les vraies images burundaises de référence
    const frontImagePath = path.resolve(
      process.cwd(),
      "../frontend/public/Sized-front-id.jpeg",
    );
    const backImagePath = path.resolve(
      process.cwd(),
      "../frontend/public/Sized-back-id.jpeg",
    );
    const selfieImagePath = path.resolve(
      process.cwd(),
      "../frontend/public/WhatsApp Image 2026-07-07 at 14.35.25.jpeg",
    );

    const frontImageBuffer = await fs.readFile(frontImagePath);
    const backImageBuffer = await fs.readFile(backImagePath);
    const selfieImageBuffer = await fs.readFile(selfieImagePath);

    const activeLivenessData = {
      eyeBlink: true,
      headTurn: true,
      mouthMovement: true,
    };

    const result = await kycEngine.runFullVerification(
      frontImageBuffer,
      backImageBuffer,
      selfieImageBuffer,
      activeLivenessData,
    );

    res.json(sanitizeKycDebugResult(result));
  } catch (error) {
    console.error("[KYC DEBUG GET] Erreur:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    res.status(500).json({
      error: "Erreur test KYC",
      message: errorMessage,
      stack: errorStack,
    });
  }
});

// Nouvelle route SSE pour suivi en temps réel
router.post(
  "/admin/kyc-burundi/debug-test-sse",
  requireAuth,
  requireRole("admin"),
  uploadRateLimit,
  kycUpload,
  async (req, res) => {
    // Vérifier que les fichiers sont présents
    if (
      !req.files ||
      !("frontImage" in req.files) ||
      !("backImage" in req.files) ||
      !("selfieImage" in req.files)
    ) {
      res
        .status(400)
        .json({ error: "Les 3 images (front, back, selfie) sont requises." });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const frontImageBuffer = files.frontImage[0].buffer;
    const backImageBuffer = files.backImage[0].buffer;
    const selfieImageBuffer = files.selfieImage[0].buffer;
    const livenessSegments = collectLivenessSegments(files);
    const livenessOrder = parseLivenessOrder(req.body?.livenessOrder);
    const livenessSessionId =
      typeof req.body?.livenessSessionId === "string"
        ? req.body.livenessSessionId
        : "";

    const session = getLivenessSession(livenessSessionId);
    if (!session || session.expiresAt < Date.now()) {
      res.status(400).json({ error: "Session liveness expirée ou inconnue." });
      return;
    }
    if (session.confirmed.size !== LIVENESS_CHALLENGES.length) {
      res.status(400).json({
        error: "Tous les défis liveness doivent être confirmés par le serveur avant l'analyse KYC.",
        confirmed: Array.from(session.confirmed),
      });
      return;
    }
    if (!livenessOrder || JSON.stringify(livenessOrder) !== JSON.stringify(session.order)) {
      res.status(400).json({ error: "Ordre liveness invalide pour cette session." });
      return;
    }
    const segmentError = validateLivenessSegments(livenessSegments);
    if (segmentError) {
      res.status(400).json({ error: segmentError });
      return;
    }
    deleteLivenessSession(livenessSessionId);
    const liveFaceFrameBuffer = selectLiveReferenceFrame(livenessSegments);
    if (!liveFaceFrameBuffer) {
      res.status(400).json({ error: "Aucune frame live de référence disponible." });
      return;
    }

    // Conservé uniquement pour compatibilité de signature; ignoré par le moteur.
    const activeLivenessData = {
      eyeBlink: true,
      headTurn: true,
      mouthMovement: true,
    };

    try {
      // Créer le moteur SSE et démarrer l'analyse
      const sseEngine = new BurundiKycSseEngine(res);
      await sseEngine.runFullVerificationWithSSE(
        frontImageBuffer,
        backImageBuffer,
        selfieImageBuffer,
        activeLivenessData,
        undefined,
        livenessSegments,
        livenessOrder,
        liveFaceFrameBuffer,
      );
      // La réponse SSE se ferme automatiquement dans runFullVerificationWithSSE
    } catch (error) {
      console.error("[KYC DEBUG SSE] Erreur pipeline:", error);

      // Si la connexion SSE n'est pas encore configurée, envoyer une erreur JSON
      if (!res.headersSent) {
        res.status(500).json({
          error: "Erreur interne du moteur KYC SSE",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

router.post(
  "/admin/kyc-burundi/debug-test",
  requireAuth,
  requireRole("admin"),
  uploadRateLimit,
  kycUpload,
  async (req, res) => {
    // Vérifier que les fichiers sont présents
    if (
      !req.files ||
      !("frontImage" in req.files) ||
      !("backImage" in req.files) ||
      !("selfieImage" in req.files)
    ) {
      res
        .status(400)
        .json({ error: "Les 3 images (front, back, selfie) sont requises." });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const frontImageBuffer = files.frontImage[0].buffer;
    const backImageBuffer = files.backImage[0].buffer;
    const selfieImageBuffer = files.selfieImage[0].buffer;
    const livenessSegments = collectLivenessSegments(files);
    const livenessOrder = parseLivenessOrder(req.body?.livenessOrder);
    const livenessSessionId =
      typeof req.body?.livenessSessionId === "string"
        ? req.body.livenessSessionId
        : "";

    const session = getLivenessSession(livenessSessionId);
    if (!session || session.expiresAt < Date.now()) {
      res.status(400).json({ error: "Session liveness expirée ou inconnue." });
      return;
    }
    if (session.confirmed.size !== LIVENESS_CHALLENGES.length) {
      res.status(400).json({
        error: "Tous les défis liveness doivent être confirmés par le serveur avant l'analyse KYC.",
        confirmed: Array.from(session.confirmed),
      });
      return;
    }
    if (!livenessOrder || JSON.stringify(livenessOrder) !== JSON.stringify(session.order)) {
      res.status(400).json({ error: "Ordre liveness invalide pour cette session." });
      return;
    }
    const segmentError = validateLivenessSegments(livenessSegments);
    if (segmentError) {
      res.status(400).json({ error: segmentError });
      return;
    }
    deleteLivenessSession(livenessSessionId);
    const liveFaceFrameBuffer = selectLiveReferenceFrame(livenessSegments);
    if (!liveFaceFrameBuffer) {
      res.status(400).json({ error: "Aucune frame live de référence disponible." });
      return;
    }

    // Conservé uniquement pour compatibilité de signature; ignoré par le moteur.
    const activeLivenessData = {
      eyeBlink: true,
      headTurn: true,
      mouthMovement: true,
    };

    try {
      // Exécuter le pipeline complet
      const result = await kycEngine.runFullVerification(
        frontImageBuffer,
        backImageBuffer,
        selfieImageBuffer,
        activeLivenessData,
        undefined,
        livenessSegments,
        livenessOrder,
        liveFaceFrameBuffer,
      );

      // Retourner TOUS les résultats intermédiaires en JSON brut
      res.json(sanitizeKycDebugResult(result));
    } catch (error) {
      console.error("[KYC DEBUG] Erreur pipeline:", error);
      if (error instanceof Error) {
        res.status(500).json({
          error: "Erreur interne du moteur KYC",
          message: error.message,
          stack: error.stack,
        });
      } else {
        res
          .status(500)
          .json({ error: "Erreur interne du moteur KYC inconnue" });
      }
    }
  },
);

export default router;
