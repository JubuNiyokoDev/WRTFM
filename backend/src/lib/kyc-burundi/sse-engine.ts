/**
 * Moteur KYC burundais avec support SSE pour suivi en temps réel
 * Version dédiée au debug admin avec émission d'événements par étape
 */

import { Response } from "express";
import {
  BurundiKycVerificationResult,
  BurundiKycConfig,
  DEFAULT_BURUNDI_KYC_CONFIG,
  KYC_ERROR_CODES,
  BurundiKycError,
} from "./types";
import { computeWeightedKycScore } from "./engine";
import { BurundiOCR } from "./ocr";
import { MifpdiValidator } from "./mifpdi-validator";
import { TriangleCoherenceValidator } from "./triangle-coherence";
import { StampComparator } from "./stamp-comparator";
import { StampContinuityDetector } from "./stamp-continuity";
import { FingerprintDetector } from "./fingerprint-detector";
import { FaceMatcher } from "./face-matcher";
import {
  LivenessDetector,
  type ActiveLivenessChallenge,
} from "./liveness-detector";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES POUR LES ÉVÉNEMENTS SSE
// ═══════════════════════════════════════════════════════════════════════════════

export interface KycStepEvent {
  stepName: string;
  status: "pending" | "running" | "success" | "fail";
  duration?: number;
  data?: any; // Données essentielles à afficher (pas tout le payload)
  error?: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE ORCHESTRATEUR KYC AVEC SSE
// ═══════════════════════════════════════════════════════════════════════════════

export class BurundiKycSseEngine {
  private config: BurundiKycConfig;
  private ocr: BurundiOCR;
  private mifpdiValidator: MifpdiValidator;
  private triangleValidator: TriangleCoherenceValidator;
  private stampComparator: StampComparator;
  private continuityDetector: StampContinuityDetector;
  private fingerprintDetector: FingerprintDetector;
  private faceMatcher: FaceMatcher;
  private livenessDetector: LivenessDetector;
  private res: Response;

  constructor(
    res: Response,
    config: BurundiKycConfig = DEFAULT_BURUNDI_KYC_CONFIG,
  ) {
    this.res = res;
    this.config = config;
    this.ocr = new BurundiOCR(config);
    this.mifpdiValidator = new MifpdiValidator();
    this.triangleValidator = new TriangleCoherenceValidator();
    this.stampComparator = new StampComparator();
    this.continuityDetector = new StampContinuityDetector();
    this.fingerprintDetector = new FingerprintDetector();
    this.faceMatcher = new FaceMatcher();
    this.livenessDetector = new LivenessDetector();

    // Configuration SSE
    this.setupSSE();
  }

  private setupSSE(): void {
    this.res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // Heartbeat pour maintenir la connexion
    const heartbeat = setInterval(() => {
      this.res.write(": heartbeat\n\n");
    }, 30000);

    this.res.on("close", () => {
      clearInterval(heartbeat);
    });
  }

  private emitStep(event: KycStepEvent): void {
    const data = JSON.stringify(event);
    this.res.write(`data: ${data}\n\n`);
  }

  private sanitizeFinalResult(
    result: BurundiKycVerificationResult,
  ): BurundiKycVerificationResult {
    if (!result.faceMatching) {
      return result;
    }

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

  private async executeStep<T>(
    stepName: string,
    operation: () => Promise<T>,
    extractData?: (result: T) => any,
  ): Promise<T> {
    const startTime = Date.now();

    // Émission pending
    this.emitStep({
      stepName,
      status: "pending",
      timestamp: new Date().toISOString(),
    });

    // Émission running
    this.emitStep({
      stepName,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      // Émission success
      this.emitStep({
        stepName,
        status: "success",
        duration,
        data: extractData ? extractData(result) : result,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Émission fail
      this.emitStep({
        stepName,
        status: "fail",
        duration,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Exécute le pipeline complet de vérification KYC avec émission d'événements SSE
   */
  async runFullVerificationWithSSE(
    frontImageBuffer: Buffer,
    backImageBuffer: Buffer,
    selfieBuffer: Buffer,
    activeLivenessData: {
      eyeBlink: boolean;
      headTurn: boolean;
      mouthMovement: boolean;
    },
    livenessFrames?: Buffer[],
    livenessSegments?: Record<ActiveLivenessChallenge, Buffer[]>,
    livenessOrder?: ActiveLivenessChallenge[],
    liveFaceFrameBuffer?: Buffer,
  ): Promise<void> {
    const results: Partial<BurundiKycVerificationResult> = {};
    const errors: BurundiKycError[] = [];

    try {
      // --- ÉTAPE 1: OCR + VALIDATIONS DE BASE ---
      results.ocr = await this.executeStep(
        "OCR - Extraction des données",
        () => this.ocr.extractAllFields(frontImageBuffer, backImageBuffer),
        (ocr) => ({
          confidence: ocr.confidence,
          fieldsExtracted:
            Object.keys(ocr.personalFields).length +
            Object.keys(ocr.officialFields).length,
          izina: ocr.personalFields.izina,
          amatazirano: ocr.personalFields.amatazirano,
          numeroMifpdi: ocr.officialFields.numeroMifpdi,
        }),
      );

      if (results.ocr!.confidence < this.config.thresholds.minOcrConfidence) {
        errors.push(
          new BurundiKycError(
            `Confiance OCR trop faible: ${results.ocr!.confidence}%`,
            KYC_ERROR_CODES.LOW_OCR_CONFIDENCE,
          ),
        );
      }

      // Validation MIFPDI si présent
      if (results.ocr!.officialFields.numeroMifpdi) {
        results.mifpdiValidation = await this.executeStep(
          "Validation numéro MIFPDI",
          () =>
            Promise.resolve(
              this.mifpdiValidator.validateMifpdi(
                results.ocr!.officialFields.numeroMifpdi!,
              ),
            ),
          (validation) => ({
            isValid: validation.isValid,
            reason: validation.reason,
            structure: validation.structure,
          }),
        );

        if (!results.mifpdiValidation.isValid) {
          errors.push(
            new BurundiKycError(
              `Numéro MIFPDI invalide: ${results.mifpdiValidation.reason}`,
              KYC_ERROR_CODES.INVALID_MIFPDI_FORMAT,
            ),
          );
        }
      }

      // --- ÉTAPE 2: VÉRIFICATIONS VISUELLES ---
      results.stampComparison = await this.executeStep(
        "Comparaison des tampons",
        () =>
          this.stampComparator.compareStamps(frontImageBuffer, backImageBuffer),
        (stamps) => ({
          areIdentical: stamps.areIdentical,
          similarity: stamps.similarity,
          method: stamps.method,
          photoStampDetected: stamps.photoStamp.detected,
          officialStampDetected: stamps.officialStamp.detected,
        }),
      );

      if (!results.stampComparison.areIdentical) {
        errors.push(
          new BurundiKycError(
            `Les tampons ne sont pas identiques (similarité: ${results.stampComparison.similarity})`,
            KYC_ERROR_CODES.STAMPS_NOT_IDENTICAL,
          ),
        );
      }

      // --- ÉTAPE 3: COHÉRENCE DU CACHET ÉMETTEUR ---
      results.triangleCoherence = await this.executeStep(
        "Cohérence du cachet émetteur",
        () =>
          this.triangleValidator.validateTriangle(
            results.ocr!,
            frontImageBuffer,
            results.stampComparison!,
          ),
        (triangle) => ({
          isCoherent: triangle.isCoherent,
          confidence: triangle.confidence,
          normalizedCommune: triangle.normalizedCommune,
          commune: triangle.commune,
          inconsistencies: triangle.inconsistencies,
        }),
      );

      if (!results.triangleCoherence.isCoherent) {
        errors.push(
          new BurundiKycError(
            `Incohérence du cachet émetteur: ${results.triangleCoherence.inconsistencies.join(", ")}`,
            KYC_ERROR_CODES.COMMUNE_INCONSISTENCY,
          ),
        );
      }

      results.stampContinuity = await this.executeStep(
        "Continuité du tampon photo",
        () => this.continuityDetector.checkContinuity(frontImageBuffer),
        (continuity) => ({
          hasContinuity: continuity.hasContinuity,
          confidence: continuity.confidence,
          edgeMatches: continuity.edgeMatches,
          method: continuity.method,
        }),
      );

      if (!results.stampContinuity.hasContinuity) {
        errors.push(
          new BurundiKycError(
            "Continuité du tampon cassée à la jonction photo/document",
            KYC_ERROR_CODES.NO_STAMP_CONTINUITY,
          ),
        );
      }

      results.fingerprintDetection = await this.executeStep(
        "Détection empreinte digitale",
        () => this.fingerprintDetector.detectFingerprint(frontImageBuffer),
        (fingerprint) => ({
          detected: fingerprint.detected,
          confidence: fingerprint.confidence,
          quality: fingerprint.quality,
          isBlueInk: fingerprint.isBlueInk,
          hasRidgePattern: fingerprint.hasRidgePattern,
          coordinates: fingerprint.coordinates,
        }),
      );

      const hasIgikumuAnchor = results.ocr?.anchorsFound?.some((anchor) =>
        anchor.toUpperCase().includes("IGIKUMU"),
      );
      if (!results.fingerprintDetection.detected && hasIgikumuAnchor) {
        results.fingerprintDetection = {
          ...results.fingerprintDetection,
          detected: true,
          confidence: Math.max(results.fingerprintDetection.confidence, 45),
          quality: "poor",
        };
      }
      if (!results.fingerprintDetection.detected) {
        errors.push(
          new BurundiKycError(
            "Zone d'empreinte non confirmée: placez le recto plus net, avec la zone IGIKUMU CA NYENEYO bien visible",
            KYC_ERROR_CODES.FINGERPRINT_NOT_DETECTED,
          ),
        );
      }

      // --- ÉTAPE 4: LIVENESS & FACE MATCHING ---
      // Défis actifs : toujours vérifiés côté serveur sur une rafale de frames.
      // Les booléens historiques du client restent dans la signature pour compat,
      // mais ne participent plus à la décision.
      let activeTests = {
        eyeBlink: false,
        headTurn: false,
        mouthMovement: false,
      };
      let activeVerification: NonNullable<
        BurundiKycVerificationResult["liveness"]
      >["activeVerification"] = {
        source: "server_verified",
        framesTotal: livenessFrames?.length ?? 0,
        framesWithFace: 0,
        reason: "Rafale serveur de 15-30 frames requise pour le liveness actif",
      };

      if (livenessSegments && livenessOrder && livenessOrder.length === 3) {
        const serverCheck = await this.executeStep(
          "Liveness actif - Défis séquentiels",
          () => this.livenessDetector.checkActiveLivenessSequence(
            livenessOrder,
            livenessSegments,
          ),
          (check) => ({
            tests: check.tests,
            order: check.order,
            framesTotal: check.framesTotal,
            framesWithFace: check.framesWithFace,
            measures: check.measures,
            series: check.series,
            segments: check.segments,
            reason: check.reason,
          }),
        );
        activeTests = serverCheck.tests;
        activeVerification = {
          source: "server_verified",
          framesTotal: serverCheck.framesTotal,
          framesWithFace: serverCheck.framesWithFace,
          measures: serverCheck.measures,
          series: serverCheck.series,
          order: serverCheck.order,
          segments: serverCheck.segments,
          reason: serverCheck.reason,
        };
      } else if (livenessFrames && livenessFrames.length >= 15) {
        const serverCheck = await this.executeStep(
          "Liveness actif - Défis de mouvement",
          () => this.livenessDetector.checkActiveLiveness(livenessFrames),
          (check) => ({
            tests: check.tests,
            framesTotal: check.framesTotal,
            framesWithFace: check.framesWithFace,
            measures: check.measures,
            series: check.series,
            reason: check.reason,
          }),
        );
        activeTests = serverCheck.tests;
        activeVerification = {
          source: "server_verified",
          framesTotal: serverCheck.framesTotal,
          framesWithFace: serverCheck.framesWithFace,
          measures: serverCheck.measures,
          series: serverCheck.series,
          reason: serverCheck.reason,
        };
      }

      const faceReferenceBuffer = liveFaceFrameBuffer ?? selfieBuffer;
      const passiveLiveness = await this.executeStep(
        "Liveness passif - Anti-spoofing",
        () => this.livenessDetector.checkPassiveLiveness(faceReferenceBuffer),
        (liveness) => ({
          isRealFace: liveness.antiSpoofing.isRealFace,
          antiSpoofScore: liveness.antiSpoofing.score,
        }),
      );

      results.liveness = await this.executeStep(
        "Liveness combiné - Actif + Passif",
        () => {
          const combined = this.livenessDetector.combineLivenessResults(
            activeTests,
            passiveLiveness,
          );
          combined.activeVerification = activeVerification;
          return Promise.resolve(combined);
        },
        (liveness) => ({
          isLive: liveness.isLive,
          confidence: liveness.confidence,
          tests: liveness.tests,
          antiSpoofing: liveness.antiSpoofing,
          activeVerification: liveness.activeVerification,
        }),
      );

      if (!results.liveness.isLive) {
        errors.push(
          new BurundiKycError(
            "Liveness a échoué (spoofing possible)",
            KYC_ERROR_CODES.LIVENESS_FAILED,
          ),
        );
      }

      results.faceMatching = await this.executeStep(
        "Comparaison faciale - ID vs visage live",
        () => this.faceMatcher.compareFaces(frontImageBuffer, faceReferenceBuffer),
        (face) => ({
          isMatch: face.isMatch,
          similarity: face.similarity,
          distance: face.distance,
          threshold: face.threshold,
          method: face.method,
        }),
      );

      if (!results.faceMatching.isMatch) {
        errors.push(
          new BurundiKycError(
            `Visage ne correspond pas (similarité: ${results.faceMatching.similarity})`,
            KYC_ERROR_CODES.FACE_SIMILARITY_TOO_LOW,
          ),
        );
      }

      // --- ÉTAPE 5: DÉCISION FINALE ET SCORE GLOBAL ---
      const finalDecision = await this.executeStep(
        "Décision finale et scoring",
        () => Promise.resolve(this.makeFinalDecision(results, errors)),
        (decision) => ({
          approved: decision.approved,
          confidence: decision.confidence,
          reason: decision.reason,
          errorsCount: errors.length,
        }),
      );

      const finalResult: BurundiKycVerificationResult = {
        ...results,
        ...finalDecision,
        method: "burundi_kyc_v1",
        processedAt: new Date().toISOString(),
        documentType: "ikarata_karangamuntu",
      } as BurundiKycVerificationResult;

      // Émission du résultat final complet
      this.emitStep({
        stepName: "RÉSULTAT FINAL",
        status: "success",
        data: this.sanitizeFinalResult(finalResult),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Émission d'erreur fatale
      this.emitStep({
        stepName: "ERREUR FATALE",
        status: "fail",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    } finally {
      // Fermeture de la connexion SSE
      this.res.end();
    }
  }

  /**
   * Prend la décision finale et calcule le score de confiance global
   */
  private makeFinalDecision(
    results: Partial<BurundiKycVerificationResult>,
    errors: BurundiKycError[],
  ): { approved: boolean; confidence: number; reason: string } {
    if (errors.length > 0) {
      return {
        approved: false,
        confidence: Math.max(20 - errors.length * 5, 0),
        reason: `Vérification échouée: ${errors.map((e) => e.message).join("; ")}`,
      };
    }

    // Calcul du score de confiance pondéré
    const finalConfidence = computeWeightedKycScore(results, this.config.weights);

    // Seuil final d'approbation
    const isApproved = finalConfidence >= 80;

    return {
      approved: isApproved,
      confidence: finalConfidence,
      reason: isApproved
        ? "Identité vérifiée avec succès"
        : "Confiance globale trop faible",
    };
  }
}
