/**
 * Moteur principal KYC burundais - Orchestrateur
 * Combine les résultats des modules indépendants pour une décision finale
 */

import {
  BurundiKycVerificationResult,
  BurundiKycConfig,
  DEFAULT_BURUNDI_KYC_CONFIG,
  KYC_ERROR_CODES,
  BurundiKycError,
} from './types';
import { BurundiOCR } from './ocr';
import { MifpdiValidator } from './mifpdi-validator';
import { TriangleCoherenceValidator } from './triangle-coherence';
import { StampComparator } from './stamp-comparator';
import { StampContinuityDetector } from './stamp-continuity';
import { FingerprintDetector } from './fingerprint-detector';
import { FaceMatcher } from './face-matcher';
import {
  LivenessDetector,
  type ActiveLivenessChallenge,
} from './liveness-detector';

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE GLOBAL PONDÉRÉ (partagé avec le moteur SSE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calcule le score global pondéré (0-100) à partir des résultats des modules.
 *
 * La similarité faciale est remise à l'échelle par rapport au seuil calibré du
 * modèle (SFace ≈ 0.36) : une similarité brute de 0.62 est un match fort mais
 * comptée naïvement comme 62/100 elle plombait le score global. Ici, seuil → 50
 * (limite), 2× le seuil → 100.
 */
export function computeWeightedKycScore(
  results: Partial<BurundiKycVerificationResult>,
  weights: BurundiKycConfig["weights"],
): number {
  const face = results.faceMatching;
  const faceThreshold = face?.threshold ?? 0;
  const faceScore = !face
    ? 0
    : faceThreshold > 0
      ? Math.max(
          0,
          Math.min(100, 50 + 50 * ((face.similarity - faceThreshold) / faceThreshold)),
        )
      : face.similarity * 100;

  let totalScore = 0;
  totalScore += (results.ocr?.confidence ?? 0) * weights.ocr;
  totalScore += (results.triangleCoherence?.confidence ?? 0) * weights.triangleCoherence;
  totalScore += (results.stampComparison?.similarity ?? 0) * 100 * weights.stampComparison;
  totalScore += (results.stampContinuity?.confidence ?? 0) * weights.stampContinuity;
  totalScore += (results.fingerprintDetection?.confidence ?? 0) * weights.fingerprint;
  totalScore += faceScore * weights.faceMatching;

  return Math.min(Math.round(totalScore), 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE ORCHESTRATEUR KYC BURUNDAIS
// ═══════════════════════════════════════════════════════════════════════════════

export class BurundiKycEngine {
  private config: BurundiKycConfig;
  private ocr: BurundiOCR;
  private mifpdiValidator: MifpdiValidator;
  private triangleValidator: TriangleCoherenceValidator;
  private stampComparator: StampComparator;
  private continuityDetector: StampContinuityDetector;
  private fingerprintDetector: FingerprintDetector;
  private faceMatcher: FaceMatcher;
  private livenessDetector: LivenessDetector;

  constructor(config: BurundiKycConfig = DEFAULT_BURUNDI_KYC_CONFIG) {
    this.config = config;
    this.ocr = new BurundiOCR(config);
    this.mifpdiValidator = new MifpdiValidator();
    this.triangleValidator = new TriangleCoherenceValidator();
    this.stampComparator = new StampComparator();
    this.continuityDetector = new StampContinuityDetector();
    this.fingerprintDetector = new FingerprintDetector();
    this.faceMatcher = new FaceMatcher();
    this.livenessDetector = new LivenessDetector();
  }

  /**
   * Exécute le pipeline complet de vérification KYC burundais
   */
  async runFullVerification(
    frontImageBuffer: Buffer,
    backImageBuffer: Buffer,
    selfieBuffer: Buffer,
    activeLivenessData: { eyeBlink: boolean; headTurn: boolean; mouthMovement: boolean },
    livenessFrames?: Buffer[],
    livenessSegments?: Record<ActiveLivenessChallenge, Buffer[]>,
    livenessOrder?: ActiveLivenessChallenge[],
    liveFaceFrameBuffer?: Buffer,
  ): Promise<BurundiKycVerificationResult> {
    
    const results: Partial<BurundiKycVerificationResult> = {};
    const errors: BurundiKycError[] = [];

    // --- ÉTAPE 1: OCR + VALIDATIONS DE BASE ---
    results.ocr = await this.ocr.extractAllFields(frontImageBuffer, backImageBuffer);
    if (results.ocr.confidence < this.config.thresholds.minOcrConfidence) {
      errors.push(new BurundiKycError(
        `Confiance OCR trop faible: ${results.ocr.confidence}%`,
        KYC_ERROR_CODES.LOW_OCR_CONFIDENCE
      ));
    }
    
    if (results.ocr.officialFields.numeroMifpdi) {
      results.mifpdiValidation = this.mifpdiValidator.validateMifpdi(
        results.ocr.officialFields.numeroMifpdi
      );
      if (!results.mifpdiValidation.isValid) {
        errors.push(new BurundiKycError(
          `Numéro MIFPDI invalide: ${results.mifpdiValidation.reason}`,
          KYC_ERROR_CODES.INVALID_MIFPDI_FORMAT
        ));
      }
    }

    // --- ÉTAPE 2: VÉRIFICATIONS VISUELLES ---
    results.stampComparison = await this.stampComparator.compareStamps(
      frontImageBuffer,
      backImageBuffer
    );
    if (!results.stampComparison.areIdentical) {
      errors.push(new BurundiKycError(
        `Les tampons ne sont pas identiques (similarité: ${results.stampComparison.similarity})`,
        KYC_ERROR_CODES.STAMPS_NOT_IDENTICAL
      ));
    }

    // --- ÉTAPE 3: COHÉRENCE DU CACHET ÉMETTEUR ---
    results.triangleCoherence = await this.triangleValidator.validateTriangle(
      results.ocr,
      frontImageBuffer, // OCR secondaire du tampon, non bloquant si illisible
      results.stampComparison,
    );
    if (!results.triangleCoherence.isCoherent) {
      errors.push(new BurundiKycError(
        `Incohérence du cachet émetteur: ${results.triangleCoherence.inconsistencies.join(', ')}`,
        KYC_ERROR_CODES.COMMUNE_INCONSISTENCY
      ));
    }

    results.stampContinuity = await this.continuityDetector.checkContinuity(frontImageBuffer);
    if (!results.stampContinuity.hasContinuity) {
      errors.push(new BurundiKycError(
        'Continuité du tampon cassée à la jonction photo/document',
        KYC_ERROR_CODES.NO_STAMP_CONTINUITY
      ));
    }

    results.fingerprintDetection = await this.fingerprintDetector.detectFingerprint(frontImageBuffer);
    const hasIgikumuAnchor = results.ocr.anchorsFound.some(
      (anchor) => anchor.toUpperCase().includes('IGIKUMU'),
    );
    if (!results.fingerprintDetection.detected && hasIgikumuAnchor) {
      results.fingerprintDetection = {
        ...results.fingerprintDetection,
        detected: true,
        confidence: Math.max(results.fingerprintDetection.confidence, 45),
        quality: 'poor',
      };
    }
    if (!results.fingerprintDetection.detected) {
      errors.push(new BurundiKycError(
        "Zone d'empreinte non confirmée: placez le recto plus net, avec la zone IGIKUMU CA NYENEYO bien visible",
        KYC_ERROR_CODES.FINGERPRINT_NOT_DETECTED
      ));
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
      BurundiKycVerificationResult['liveness']
    >['activeVerification'] = {
      source: 'server_verified',
      framesTotal: livenessFrames?.length ?? 0,
      framesWithFace: 0,
      reason: 'Rafale serveur de 15-30 frames requise pour le liveness actif',
    };

    if (livenessSegments && livenessOrder && livenessOrder.length === 3) {
      const serverCheck = await this.livenessDetector.checkActiveLivenessSequence(
        livenessOrder,
        livenessSegments,
      );
      activeTests = serverCheck.tests;
      activeVerification = {
        source: 'server_verified',
        framesTotal: serverCheck.framesTotal,
        framesWithFace: serverCheck.framesWithFace,
        measures: serverCheck.measures,
        series: serverCheck.series,
        order: serverCheck.order,
        segments: serverCheck.segments,
        reason: serverCheck.reason,
      };
    } else if (livenessFrames && livenessFrames.length >= 15) {
      const serverCheck = await this.livenessDetector.checkActiveLiveness(livenessFrames);
      activeTests = serverCheck.tests;
      activeVerification = {
        source: 'server_verified',
        framesTotal: serverCheck.framesTotal,
        framesWithFace: serverCheck.framesWithFace,
        measures: serverCheck.measures,
        series: serverCheck.series,
        reason: serverCheck.reason,
      };
    }

    const faceReferenceBuffer = liveFaceFrameBuffer ?? selfieBuffer;
    const passiveLiveness = await this.livenessDetector.checkPassiveLiveness(
      faceReferenceBuffer,
    );
    results.liveness = this.livenessDetector.combineLivenessResults(
      activeTests,
      passiveLiveness
    );
    results.liveness.activeVerification = activeVerification;
    if (!results.liveness.isLive) {
      errors.push(new BurundiKycError(
        'Liveness a échoué (spoofing possible)',
        KYC_ERROR_CODES.LIVENESS_FAILED
      ));
    }

    results.faceMatching = await this.faceMatcher.compareFaces(
      frontImageBuffer, // Le portrait sera extrait de cette image
      faceReferenceBuffer,
    );
    if (!results.faceMatching.isMatch) {
      errors.push(new BurundiKycError(
        `Visage ne correspond pas (similarité: ${results.faceMatching.similarity})`,
        KYC_ERROR_CODES.FACE_SIMILARITY_TOO_LOW
      ));
    }

    // --- ÉTAPE 5: DÉCISION FINALE ET SCORE GLOBAL ---
    const finalDecision = this.makeFinalDecision(results, errors);

    return {
      ...results,
      ...finalDecision,
      method: 'burundi_kyc_v1',
      processedAt: new Date().toISOString(),
      documentType: 'ikarata_karangamuntu'
    } as BurundiKycVerificationResult;
  }

  /**
   * Prend la décision finale et calcule le score de confiance global
   */
  private makeFinalDecision(
    results: Partial<BurundiKycVerificationResult>,
    errors: BurundiKycError[]
  ): { approved: boolean; confidence: number; reason: string } {
    
    if (errors.length > 0) {
      return {
        approved: false,
        confidence: 20 - errors.length,
        reason: `Vérification échouée: ${errors.map(e => e.message).join('; ')}`
      };
    }
    
    // Calcul du score de confiance pondéré
    const finalConfidence = computeWeightedKycScore(results, this.config.weights);
    
    // Seuil final d'approbation
    const isApproved = finalConfidence >= 80;
    
    return {
      approved: isApproved,
      confidence: finalConfidence,
      reason: isApproved ? 'Identité vérifiée avec succès' : 'Confiance globale trop faible'
    };
  }
}

/**
 * Fonction principale pour lancer la vérification KYC burundaise
 */
export async function runBurundiKycVerification(
  frontImage: Buffer,
  backImage: Buffer,
  selfieImage: Buffer,
  livenessData: { eyeBlink: boolean; headTurn: boolean; mouthMovement: boolean },
  config?: BurundiKycConfig,
  livenessFrames?: Buffer[]
): Promise<BurundiKycVerificationResult> {
  const engine = new BurundiKycEngine(config);
  return engine.runFullVerification(
    frontImage,
    backImage,
    selfieImage,
    livenessData,
    livenessFrames
  );
}

/**
 * Crée un rapport d'analyse lisible des résultats KYC
 */
export function generateKycReport(result: BurundiKycVerificationResult): string {
  
  const report: string[] = [];
  
  report.push('## RAPPORT DE VÉRIFICATION KYC BURUNDAIS ##');
  report.push(`Résultat: ${result.approved ? 'APPROUVÉ' : 'REJETÉ'} (Confiance: ${result.confidence}%)`);
  report.push(`Raison: ${result.reason}`);
  report.push('---');
  
  // OCR
  report.push('1. OCR des Données');
  report.push(`  - Confiance globale: ${result.ocr.confidence}%`);
  report.push(`  - Nom: ${result.ocr.personalFields.izina || 'N/A'}`);
  report.push(`  - Prénoms: ${result.ocr.personalFields.amatazirano || 'N/A'}`);
  report.push(`  - N° MIFPDI: ${result.ocr.officialFields.numeroMifpdi || 'N/A'}`);
  
  // MIFPDI
  report.push('2. Validation N° MIFPDI');
  report.push(`  - Valide: ${result.mifpdiValidation.isValid}`);
  if (result.mifpdiValidation.structure) {
    report.push(`  - Année: ${result.mifpdiValidation.structure.year}`);
    report.push(`  - Commune: ${result.mifpdiValidation.structure.commune}`);
  }
  
  // Triangle de cohérence
  report.push('3. Triangle de Cohérence (Commune)');
  report.push(`  - Cohérent: ${result.triangleCoherence.isCoherent}`);
  report.push(`  - Confiance: ${result.triangleCoherence.confidence}%`);
  report.push(`  - Commune normalisée: ${result.triangleCoherence.normalizedCommune || 'N/A'}`);
  
  // Visuels
  report.push('4. Vérifications Visuelles');
  report.push(`  - Tampons identiques: ${result.stampComparison.areIdentical} (Similarité: ${result.stampComparison.similarity})`);
  report.push(`  - Continuité tampon: ${result.stampContinuity.hasContinuity} (Confiance: ${result.stampContinuity.confidence}%)`);
  report.push(`  - Empreinte détectée: ${result.fingerprintDetection.detected} (Qualité: ${result.fingerprintDetection.quality})`);
  
  // Visage
  report.push('5. Vérification Visage');
  if (result.liveness && result.faceMatching) {
    report.push(`  - Liveness: ${result.liveness.isLive} (Confiance: ${result.liveness.confidence}%)`);
    report.push(`  - Face Match: ${result.faceMatching.isMatch} (Similarité: ${result.faceMatching.similarity})`);
  }
  
  report.push('---');
  
  return report.join('\n');
}
