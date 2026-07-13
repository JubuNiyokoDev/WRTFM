/**
 * Types et interfaces pour le moteur KYC burundais
 * Basé sur l'analyse des vrais documents burundais (Sized-front-id.jpeg, Sized-back-id.jpeg)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURE DU DOCUMENT BURUNDAIS (4 zones identifiées)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Champs de la page personnelle (Zone A)
 * Libellés en Kirundi utilisés comme ancres OCR
 */
export interface BurundiPersonalFields {
  /** IZINA - Nom de famille */
  izina?: string;
  /** AMATAZIRANO - Prénoms */
  amatazirano?: string;
  /** SE - Genre */
  se?: string;
  /** NYINA - Nom de la mère */
  nyina?: string;
  /** PROVENSI - Province */
  provensi?: string;
  /** KOMINE - Commune d'origine/enregistrement, donnée de profil uniquement */
  komine?: string;
  /** YAVUKIYE - Date de naissance */
  yavukiye?: string;
  /** ITALIKI - Date d'émission */
  italiki?: string;
  /** ARUBATSE - Lieu de naissance */
  arubatse?: string;
  /** AKAZI AKORA - Profession */
  akaziAkora?: string;
}

/**
 * Champs de la page d'émission officielle (Zone D)
 */
export interface BurundiOfficialFields {
  /** N° MIFPDI - Numéro d'identité structuré (format variable) */
  numeroMifpdi?: string;
  /** ITANGIWE I - Lieu d'émission */
  itangiweI?: string;
  /** ITALIKI - Date d'émission (doit correspondre à page personnelle) */
  italiki?: string;
  /** UWUYITANZE - Nom + titre administrateur communal */
  uwuyitanze?: string;
}

/**
 * Résultat de l'extraction OCR complète
 */
export interface BurundiOCRResult {
  personalFields: BurundiPersonalFields;
  officialFields: BurundiOfficialFields;
  confidence: number; // 0-100, confiance globale OCR
  detectedLanguage: "kirundi" | "french" | "mixed";
  anchorsFound: string[]; // Libellés Kirundi détectés
  stampZoneText?: string; // Texte OCR de la zone IKASHE du recto (source secours pour le triangle)
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION MIFPDI (format adaptatif)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Structure du numéro MIFPDI variable selon commune/année
 * Exemples réels: 1705/482.182/2021, 1705/481.013/2018
 */
export interface MifpdiStructure {
  full: string;
  groups: string[];
  commune: string; // Premier groupe
  middle: string; // Groupe du milieu (format variable)
  year: string; // Dernier groupe (année 4 chiffres)
  isValid: boolean;
  pattern: string; // Pattern détecté pour debugging
}

export interface MifpdiValidationResult {
  isValid: boolean;
  structure?: MifpdiStructure;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIANGLE DE COHÉRENCE (vérification centrale)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Données de cohérence du cachet émetteur.
 * KOMINE est gardé pour debug/profil mais ne participe pas à la décision.
 */
export interface CommuneTriangle {
  /** Commune extraite du champ KOMINE (page personnelle) */
  komine?: string;
  /** Commune extraite du tampon OCR (zone photo) */
  stampOcr?: string;
  /** Commune extraite de ITANGIWE I + UWUYITANZE (page émission) */
  officialLocation?: string;
}

export interface TriangleCoherenceResult {
  isCoherent: boolean;
  commune: CommuneTriangle;
  confidence: number; // 0-100
  inconsistencies: string[];
  normalizedCommune?: string; // Commune finale si cohérente
}

// ═══════════════════════════════════════════════════════════════════════════════
// DÉTECTION TAMPONS ET ÉLÉMENTS VISUELS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Détection du tampon de commune (rond bleu, chevauche photo)
 */
export interface StampDetection {
  detected: boolean;
  coordinates: { x: number; y: number; width: number; height: number };
  confidence: number;
  color: "blue" | "red" | "black" | "unknown";
  text?: string; // OCR du texte dans le tampon
  overlapsPhoto: boolean; // Chevauche la photo (critère anti-fraude)
}

/**
 * Comparaison entre les deux tampons (zone photo vs zone émission)
 */
export interface StampComparisonResult {
  areIdentical: boolean;
  similarity: number; // 0-1
  photoStamp: StampDetection;
  officialStamp: StampDetection;
  method: "histogram" | "template_matching" | "combined";
}

/**
 * Détection de l'empreinte digitale (IGIKUMU CA NYENEYO)
 */
export interface FingerprintDetection {
  detected: boolean;
  coordinates?: { x: number; y: number; width: number; height: number };
  confidence: number; // 0-100
  isBlueInk: boolean;
  hasRidgePattern: boolean; // Présence de crêtes concentriques
  quality: "good" | "poor" | "unreadable";
}

/**
 * Vérification de continuité du tampon à la jonction photo/document
 */
export interface StampContinuityResult {
  hasContinuity: boolean;
  confidence: number;
  edgeMatches: number; // Nombre de points de correspondance sur la bordure
  method: "edge_detection" | "color_gradient";
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVENESS ET FACE MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Résultat de détection liveness (MediaPipe FaceLandmarker)
 */
export interface LivenessResult {
  isLive: boolean;
  confidence: number;
  tests: {
    eyeBlink: boolean;
    headTurn: boolean;
    mouthMovement: boolean;
  };
  antiSpoofing: {
    score: number; // Silent-Face-Anti-Spoofing
    isRealFace: boolean;
  };
  /**
   * Provenance des tests actifs : les défis sont toujours vérifiés côté serveur
   * sur une rafale de frames capturées. Les booléens client ne participent plus
   * à la décision.
   */
  activeVerification?: {
    source: "server_verified";
    framesTotal?: number;
    framesWithFace?: number;
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
    order?: string[];
    segments?: Record<string, unknown>;
    reason?: string;
  };
}

/**
 * Matching facial via embeddings ONNX.
 */
export interface FaceMatchingResult {
  similarity: number; // 0-1
  threshold: number; // Seuil utilisé
  isMatch: boolean;
  method: "face_api_descriptors" | "sface_onnx" | "sface_opencv";
  distance: number;
  cardFaceEmbedding: number[];
  selfieFaceEmbedding: number[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// RÉSULTAT GLOBAL DU MOTEUR KYC BURUNDAIS
// ═══════════════════════════════════════════════════════════════════════════════

export interface BurundiKycVerificationResult {
  approved: boolean;
  confidence: number; // 0-100, score global
  reason: string;

  // Résultats détaillés de chaque module
  ocr: BurundiOCRResult;
  mifpdiValidation: MifpdiValidationResult;
  triangleCoherence: TriangleCoherenceResult;
  stampComparison: StampComparisonResult;
  stampContinuity: StampContinuityResult;
  fingerprintDetection: FingerprintDetection;
  liveness?: LivenessResult;
  faceMatching?: FaceMatchingResult;

  // Metadata
  method: "burundi_kyc_v1";
  processedAt: string;
  documentType: "ikarata_karangamuntu";
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DU MOTEUR
// ═══════════════════════════════════════════════════════════════════════════════

export interface BurundiKycConfig {
  // Seuils de validation
  thresholds: {
    minOcrConfidence: number; // défaut: 70
    minTriangleCoherence: number; // défaut: 80
    minStampSimilarity: number; // défaut: 75
    minStampContinuity: number; // défaut: 70
    minFingerprintConfidence: number; // défaut: 60
    minFaceSimilarity: number; // défaut: 0.6
  };

  // Poids pour score global (somme = 1.0)
  weights: {
    ocr: number; // défaut: 0.15
    triangleCoherence: number; // défaut: 0.25 (vérification centrale)
    stampComparison: number; // défaut: 0.20
    stampContinuity: number; // défaut: 0.15
    fingerprint: number; // défaut: 0.10
    faceMatching: number; // défaut: 0.15
  };

  // Options OCR
  ocr: {
    language: string; // PaddleOCR lang, défaut fr
    psm: number; // conservé pour compatibilité config historique
    oem: number; // conservé pour compatibilité config historique
  };
}

/**
 * Configuration par défaut optimisée pour documents burundais
 */
export const DEFAULT_BURUNDI_KYC_CONFIG: BurundiKycConfig = {
  thresholds: {
    minOcrConfidence: 70,
    minTriangleCoherence: 80,
    minStampSimilarity: 75,
    minStampContinuity: 70,
    minFingerprintConfidence: 60,
    minFaceSimilarity: 0.6,
  },
  weights: {
    ocr: 0.15,
    triangleCoherence: 0.25, // Poids le plus élevé - vérification centrale
    stampComparison: 0.2,
    stampContinuity: 0.15,
    fingerprint: 0.1,
    faceMatching: 0.15,
  },
  ocr: {
    language: "fr",
    psm: 6,
    oem: 3,
  },
};

/**
 * Erreurs spécifiques au moteur KYC burundais
 */
export class BurundiKycError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = "BurundiKycError";
  }
}

export const KYC_ERROR_CODES = {
  // Erreurs OCR
  OCR_FAILED: "OCR_FAILED",
  ANCHORS_NOT_FOUND: "ANCHORS_NOT_FOUND",
  LOW_OCR_CONFIDENCE: "LOW_OCR_CONFIDENCE",

  // Erreurs validation MIFPDI
  INVALID_MIFPDI_FORMAT: "INVALID_MIFPDI_FORMAT",
  INVALID_YEAR: "INVALID_YEAR",

  // Erreurs triangle de cohérence
  COMMUNE_INCONSISTENCY: "COMMUNE_INCONSISTENCY",
  MISSING_COMMUNE_DATA: "MISSING_COMMUNE_DATA",

  // Erreurs visuelles
  STAMPS_NOT_IDENTICAL: "STAMPS_NOT_IDENTICAL",
  NO_STAMP_CONTINUITY: "NO_STAMP_CONTINUITY",
  FINGERPRINT_NOT_DETECTED: "FINGERPRINT_NOT_DETECTED",

  // Erreurs face matching
  MODEL_LOAD_FAILED: "MODEL_LOAD_FAILED",
  FACE_NOT_DETECTED: "FACE_NOT_DETECTED",
  FACE_SIMILARITY_TOO_LOW: "FACE_SIMILARITY_TOO_LOW",
  LIVENESS_FAILED: "LIVENESS_FAILED",
  ANTISPOOFING_FAILED: "ANTISPOOFING_FAILED",
} as const;
