/**
 * Module 3: Cohérence du cachet émetteur.
 *
 * Règle corrigée après test réel:
 * KOMINE est une donnée de profil (commune d'origine/enregistrement) et ne
 * participe plus à la décision anti-fraude. La cohérence porte sur les deux
 * tampons visuels, avec OCR du tampon comme signal secondaire non bloquant.
 */

import {
  CommuneTriangle,
  TriangleCoherenceResult,
  BurundiOCRResult,
  StampComparisonResult,
} from './types';

const KYC_VISION_SERVICE_URL =
  process.env.KYC_VISION_SERVICE_URL ?? "http://localhost:5010";
const STAMP_OCR_TIMEOUT_MS = Number(process.env.KYC_STAMP_OCR_TIMEOUT_MS ?? "60000");

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALISATION DES NOMS DE COMMUNES BURUNDAISES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Liste des communes burundaises connues avec variantes orthographiques
 * Source: structure administrative du Burundi
 * À compléter avec plus de spécimens réels
 */
const BURUNDI_COMMUNES: Record<string, string[]> = {
  // Format: nom_normalisé: [variantes possibles]
  'BUJUMBURA': ['BUJUMBURA', 'BUJUMBURA MAIRIE', 'BUJA', 'BJUMBURA'],
  'GITEGA': ['GITEGA', 'GITEGA VILLE', 'GITENGA'],
  'NGOZI': ['NGOZI', 'NGOZI VILLE'],
  'BURURI': ['BURURI'],
  'MAKAMBA': ['MAKAMBA'],
  'MURAMVYA': ['MURAMVYA', 'MURANVYA'],
  'RUTANA': ['RUTANA'],
  'RUYIGI': ['RUYIGI', 'RUYIGI VILLE'],
  'CANKUZO': ['CANKUZO', 'CANKUSO'],
  'KIRUNDO': ['KIRUNDO'],
  'MUYINGA': ['MUYINGA'],
  'KARUZI': ['KARUZI', 'KARUSI'],
  'KAYANZA': ['KAYANZA', 'KAYANSA'],
  'CIBITOKE': ['CIBITOKE', 'CIBITOKE VILLE'],
  'BUBANZA': ['BUBANZA'],
  'MWARO': ['MWARO'],
  'RUMONGE': ['RUMONGE', 'RUMONGE VILLE'],
  'KINYINYA': ['KINYINYA', 'KINYINIA'],
  // À compléter avec plus de communes et leurs variantes
};

/**
 * Patterns de nettoyage pour normaliser les noms de communes
 */
const COMMUNE_CLEANING_PATTERNS = [
  { pattern: /commune\s+(de\s+)?/gi, replacement: '' },
  { pattern: /\s+ville$/gi, replacement: '' },
  { pattern: /[^\w\s]/g, replacement: '' },
  { pattern: /\s{2,}/g, replacement: ' ' },
  { pattern: /^\s+|\s+$/g, replacement: '' }
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE TRIANGLE DE COHÉRENCE
// ═══════════════════════════════════════════════════════════════════════════════

export class TriangleCoherenceValidator {

  /**
   * Valide la cohérence du cachet émetteur.
   * KOMINE est conservé dans le résultat pour debug/profil, jamais comparé.
   */
  async validateTriangle(
    ocrResult: BurundiOCRResult,
    stampImageBuffer?: Buffer,
    stampComparison?: StampComparisonResult,
  ): Promise<TriangleCoherenceResult> {
    const komine = ocrResult.personalFields.komine;
    const officialLocation = this.extractOfficialLocation(ocrResult);

    let stampOcr: string | undefined;
    if (stampImageBuffer) {
      stampOcr = await this.extractTextFromStamp(stampImageBuffer);
    }

    // Secours : si /stamp-ocr n'a rien donné d'exploitable, utiliser le texte
    // que l'OCR pleine page a lu dans la zone IKASHE du recto.
    if ((!stampOcr || !this.normalizeKnownCommune(stampOcr)) && ocrResult.stampZoneText) {
      if (this.normalizeKnownCommune(ocrResult.stampZoneText)) {
        stampOcr = ocrResult.stampZoneText;
      }
    }

    const triangle: CommuneTriangle = {
      komine,
      stampOcr,
      officialLocation
    };

    return this.analyzeCoherence(triangle, stampComparison);
  }

  /**
   * Extrait le texte du tampon de commune par OCR
   */
  private async extractTextFromStamp(stampBuffer: Buffer): Promise<string | undefined> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(stampBuffer)], { type: "image/jpeg" });
    formData.append("image", blob, "stamp-source.jpg");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STAMP_OCR_TIMEOUT_MS);

    try {
      const response = await fetch(`${KYC_VISION_SERVICE_URL}/stamp-ocr`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`[Triangle] KYC Vision /stamp-ocr ${response.status}:`, text);
        return undefined;
      }

      const result = (await response.json()) as { ocr_text?: string | null };
      return result.ocr_text?.trim() || undefined;
    } catch (error) {
      console.warn('[Triangle] Erreur OCR tampon:', error);
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractOfficialLocation(ocrResult: BurundiOCRResult): string | undefined {
    const itangiweI = ocrResult.officialFields.itangiweI;
    const uwuyitanze = ocrResult.officialFields.uwuyitanze;
    
    if (itangiweI) {
      return itangiweI;
    }
    
    if (uwuyitanze) {
      const communeMatch = uwuyitanze.match(/(?:de|De)\s+([A-Z][a-z]+)/);
      if (communeMatch) {
        return communeMatch[1];
      }
    }
    
    return undefined;
  }


  /**
   * Analyse la cohérence du cachet émetteur.
   */
  private analyzeCoherence(
    triangle: CommuneTriangle,
    stampComparison?: StampComparisonResult,
  ): TriangleCoherenceResult {
    const normalizedOfficial = triangle.officialLocation
      ? this.normalizeKnownCommune(triangle.officialLocation)
      : undefined;
    const normalizedStamp = triangle.stampOcr
      ? this.normalizeKnownCommune(triangle.stampOcr)
      : undefined;

    if (
      normalizedStamp &&
      normalizedOfficial &&
      normalizedStamp !== normalizedOfficial
    ) {
      return {
        isCoherent: false,
        commune: triangle,
        confidence: 20,
        inconsistencies: [
          `Tampon OCR (${triangle.stampOcr}) ≠ Lieu officiel (${triangle.officialLocation})`
        ],
      };
    }

    if (stampComparison?.areIdentical) {
      const visualConfidence = Math.max(
        80,
        Math.min(100, Math.round(stampComparison.similarity * 100)),
      );
      return {
        isCoherent: true,
        commune: triangle,
        confidence: normalizedStamp && normalizedOfficial ? 100 : visualConfidence,
        inconsistencies: [],
        normalizedCommune: normalizedStamp ?? normalizedOfficial,
      };
    }

    if (stampComparison && !stampComparison.areIdentical) {
      return {
        isCoherent: false,
        commune: triangle,
        confidence: Math.round(stampComparison.similarity * 100),
        inconsistencies: [
          `Les deux tampons ne sont pas visuellement identiques (similarité: ${stampComparison.similarity})`
        ],
        normalizedCommune: normalizedStamp ?? normalizedOfficial,
      };
    }

    // Sans comparaison visuelle disponible, l'OCR tampon seul ne doit pas bloquer:
    // le texte circulaire est fragile. On retourne un état neutre exploitable.
    return {
      isCoherent: true,
      commune: triangle,
      confidence: normalizedStamp && normalizedOfficial ? 85 : 50,
      inconsistencies: [],
      normalizedCommune: normalizedStamp ?? normalizedOfficial,
    };
  }

  /**
   * Normalise un nom de commune pour comparaison
   * Gère les variantes orthographiques et erreurs OCR courantes
   */
  private normalizeCommune(commune: string): string {
    return this.normalizeKnownCommune(commune) ?? this.cleanCommuneText(commune);
  }

  private cleanCommuneText(commune: string): string {
    if (!commune) return '';
    
    let normalized = commune.toUpperCase();
    
    // Appliquer patterns de nettoyage
    for (const { pattern, replacement } of COMMUNE_CLEANING_PATTERNS) {
      normalized = normalized.replace(pattern, replacement);
    }
    
    return normalized.trim();
  }

  private normalizeKnownCommune(commune: string): string | undefined {
    const normalized = this.cleanCommuneText(commune);
    if (!normalized || normalized.length < 3) return undefined;

    // Chercher correspondance dans les communes connues
    for (const [canonical, variants] of Object.entries(BURUNDI_COMMUNES)) {
      for (const variant of variants) {
        if (normalized.includes(variant) || variant.includes(normalized)) {
          return canonical;
        }
      }
    }
    return undefined;
  }

  /**
   * Extrait les noms de communes possibles d'un texte libre
   * Utile pour analyser le texte OCR d'un tampon
   */
  extractCommunesFromText(text: string): string[] {
    const found: string[] = [];
    const upperText = text.toUpperCase();
    
    for (const [canonical, variants] of Object.entries(BURUNDI_COMMUNES)) {
      for (const variant of variants) {
        if (upperText.includes(variant)) {
          found.push(canonical);
          break;
        }
      }
    }
    
    return [...new Set(found)]; // Dédupliquer
  }

  /**
   * Calcule un score de similarité entre deux noms de communes
   * Utile pour gérer les erreurs OCR mineures
   */
  calculateCommuneSimilarity(commune1: string, commune2: string): number {
    const norm1 = this.normalizeCommune(commune1);
    const norm2 = this.normalizeCommune(commune2);
    
    if (norm1 === norm2) return 1.0;
    
    // Levenshtein distance simple
    const maxLen = Math.max(norm1.length, norm2.length);
    const distance = this.levenshteinDistance(norm1, norm2);
    
    return 1 - (distance / maxLen);
  }

  /**
   * Calcule la distance de Levenshtein entre deux chaînes
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

/**
 * Instance globale du validateur triangle
 */
export const triangleValidator = new TriangleCoherenceValidator();

/**
 * Fonction utilitaire pour validation rapide
 */
export async function validateCommuneTriangle(
  ocrResult: BurundiOCRResult,
  stampImageBuffer?: Buffer,
  stampComparison?: StampComparisonResult,
): Promise<TriangleCoherenceResult> {
  return triangleValidator.validateTriangle(ocrResult, stampImageBuffer, stampComparison);
}
