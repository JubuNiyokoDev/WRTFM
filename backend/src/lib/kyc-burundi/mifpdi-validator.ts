/**
 * Module 2: Validation du numéro MIFPDI adaptatif
 * Format variable selon commune/année - pas de regex figée
 * Exemples réels: 1705/482.182/2021, 1705/481.013/2018
 */

import {
  MifpdiStructure,
  MifpdiValidationResult,
  BurundiKycError,
  KYC_ERROR_CODES
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERNS ET STRUCTURES MIFPDI OBSERVÉS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Patterns MIFPDI observés sur les vrais spécimens burundais
 * Structure générale: COMMUNE/GROUPE_VARIABLE/ANNÉE
 */
const KNOWN_MIFPDI_PATTERNS = [
  {
    pattern: /^(\d{4})\/(\d{3}\.\d{3})\/(\d{4})$/,
    description: '4chiffres/3.3chiffres/année (ex: 1705/482.182/2021)',
    example: '1705/482.182/2021'
  },
  {
    pattern: /^(\d{4})\/(\d{3}\.\d{2,3})\/(\d{4})$/,
    description: '4chiffres/3.2-3chiffres/année (ex: 1705/481.013/2018)',
    example: '1705/481.013/2018'
  },
  {
    pattern: /^(\d{3,4})\/(\d{2,4}\.\d{2,4})\/(\d{4})$/,
    description: 'Pattern flexible pour variations communales',
    example: '705/12.345/2022'
  },
  {
    pattern: /^(\d{3,5})\/(\d{1,5})\/(\d{4})$/,
    description: 'Format simplifié sans point décimal',
    example: '1705/12345/2023'
  }
] as const;

/**
 * Années valides pour les documents burundais
 * Basé sur l'indépendance du Burundi (1962) et années futures raisonnables
 */
const VALID_YEAR_RANGE = {
  MIN: 1962, // Indépendance du Burundi
  MAX: new Date().getFullYear() + 2 // +2 ans pour les renouvellements futurs
} as const;

/**
 * Codes communes observés (à étendre avec plus de spécimens)
 * Format: code numérique de la commune d'émission
 */
const KNOWN_COMMUNE_CODES = [
  '1705', // Observé sur spécimens réels
  // À compléter avec plus de données réelles
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE VALIDATION MIFPDI
// ═══════════════════════════════════════════════════════════════════════════════

export class MifpdiValidator {
  
  /**
   * Valide un numéro MIFPDI avec logique adaptative
   */
  validateMifpdi(mifpdi: string): MifpdiValidationResult {
    if (!mifpdi || typeof mifpdi !== 'string') {
      return {
        isValid: false,
        reason: 'Numéro MIFPDI manquant ou invalide'
      };
    }

    // Nettoyer le numéro (espaces, caractères parasites)
    const cleanMifpdi = this.cleanMifpdiString(mifpdi);
    
    // Tentative de parsing avec patterns connus
    const structure = this.parseMifpdiStructure(cleanMifpdi);
    
    if (!structure) {
      return {
        isValid: false,
        reason: `Format MIFPDI non reconnu: ${cleanMifpdi}`
      };
    }

    // Validation de la structure parsée
    const validation = this.validateParsedStructure(structure);
    
    return {
      isValid: validation.isValid,
      structure: validation.isValid ? structure : undefined,
      reason: validation.reason
    };
  }

  /**
   * Nettoie la chaîne MIFPDI des caractères parasites
   */
  private cleanMifpdiString(mifpdi: string): string {
    return mifpdi
      .trim()
      .replace(/\s+/g, '') // Supprimer espaces
      .replace(/[^\d\/\.]/g, '') // Garder seulement chiffres, / et .
      .replace(/\.{2,}/g, '.') // Normaliser points multiples
      .replace(/\/{2,}/g, '/'); // Normaliser slashes multiples
  }

  /**
   * Parse la structure du MIFPDI en utilisant les patterns connus
   */
  private parseMifpdiStructure(mifpdi: string): MifpdiStructure | null {
    for (const knownPattern of KNOWN_MIFPDI_PATTERNS) {
      const match = mifpdi.match(knownPattern.pattern);
      
      if (match) {
        const [full, commune, middle, year] = match;
        
        return {
          full: mifpdi,
          groups: [commune, middle, year],
          commune,
          middle,
          year,
          isValid: true, // Sera validé après
          pattern: knownPattern.description
        };
      }
    }

    // Tentative de parsing générique si patterns connus échouent
    return this.parseGenericMifpdiStructure(mifpdi);
  }

  /**
   * Parser générique pour formats MIFPDI non reconnus
   * Structure attendue: GROUPE/GROUPE/ANNÉE
   */
  private parseGenericMifpdiStructure(mifpdi: string): MifpdiStructure | null {
    // Pattern très générique: au moins 3 groupes séparés par /
    const genericMatch = mifpdi.match(/^([^\/]+)\/([^\/]+)\/([^\/]+)$/);
    
    if (!genericMatch) {
      return null;
    }

    const [full, groupe1, groupe2, groupe3] = genericMatch;
    
    // Identifier quel groupe est l'année (4 chiffres à la fin typiquement)
    const yearMatch = groupe3.match(/(\d{4})/);
    if (!yearMatch) {
      return null;
    }

    return {
      full: mifpdi,
      groups: [groupe1, groupe2, groupe3],
      commune: groupe1,
      middle: groupe2,
      year: yearMatch[1],
      isValid: true,
      pattern: 'generic_three_groups'
    };
  }

  /**
   * Valide la structure parsée selon les règles burundaises
   */
  private validateParsedStructure(structure: MifpdiStructure): { isValid: boolean; reason: string } {
    
    // 1. Validation de l'année
    const yearNum = parseInt(structure.year, 10);
    if (isNaN(yearNum) || yearNum < VALID_YEAR_RANGE.MIN || yearNum > VALID_YEAR_RANGE.MAX) {
      return {
        isValid: false,
        reason: `Année invalide: ${structure.year}. Doit être entre ${VALID_YEAR_RANGE.MIN} et ${VALID_YEAR_RANGE.MAX}`
      };
    }

    // 2. Validation du code commune (si connu)
    const isKnownCommune = KNOWN_COMMUNE_CODES.includes(structure.commune as any);
    if (!isKnownCommune && structure.commune.length < 2) {
      return {
        isValid: false,
        reason: `Code commune trop court: ${structure.commune}`
      };
    }

    // 3. Validation du groupe du milieu (doit contenir des chiffres)
    if (!/\d/.test(structure.middle)) {
      return {
        isValid: false,
        reason: `Groupe milieu invalide: ${structure.middle} (doit contenir des chiffres)`
      };
    }

    // 4. Validation de la longueur totale (raisonnable)
    if (structure.full.length < 8 || structure.full.length > 25) {
      return {
        isValid: false,
        reason: `Longueur MIFPDI invalide: ${structure.full.length} caractères`
      };
    }

    // 5. Validation cohérence année vs date actuelle
    const currentYear = new Date().getFullYear();
    if (yearNum > currentYear) {
      // Tolérance pour renouvellements futurs programmés
      if (yearNum > currentYear + 2) {
        return {
          isValid: false,
          reason: `Année trop future: ${yearNum}`
        };
      }
    }

    return {
      isValid: true,
      reason: `MIFPDI valide (pattern: ${structure.pattern})`
    };
  }

  /**
   * Extrait le code commune du MIFPDI pour triangle de cohérence
   */
  extractCommuneCode(mifpdi: string): string | null {
    const validation = this.validateMifpdi(mifpdi);
    return validation.structure?.commune || null;
  }

  /**
   * Extrait l'année d'émission du MIFPDI
   */
  extractEmissionYear(mifpdi: string): number | null {
    const validation = this.validateMifpdi(mifpdi);
    const year = validation.structure?.year;
    return year ? parseInt(year, 10) : null;
  }

  /**
   * Compare deux numéros MIFPDI pour détecter les incohérences
   */
  compareMifpdiNumbers(mifpdi1: string, mifpdi2: string): {
    areConsistent: boolean;
    differences: string[];
  } {
    const val1 = this.validateMifpdi(mifpdi1);
    const val2 = this.validateMifpdi(mifpdi2);
    
    const differences: string[] = [];

    if (!val1.isValid || !val2.isValid) {
      differences.push('Un ou plusieurs MIFPDI invalides');
      return { areConsistent: false, differences };
    }

    const struct1 = val1.structure!;
    const struct2 = val2.structure!;

    // Comparer commune (devrait être identique)
    if (struct1.commune !== struct2.commune) {
      differences.push(`Code commune différent: ${struct1.commune} vs ${struct2.commune}`);
    }

    // Comparer année (peut être différente pour renouvellements)
    const yearDiff = Math.abs(parseInt(struct1.year) - parseInt(struct2.year));
    if (yearDiff > 10) { // Tolérance de 10 ans pour renouvellements
      differences.push(`Écart d'année suspect: ${struct1.year} vs ${struct2.year}`);
    }

    return {
      areConsistent: differences.length === 0,
      differences
    };
  }
}

/**
 * Instance globale du validateur MIFPDI
 */
export const mifpdiValidator = new MifpdiValidator();

/**
 * Fonction utilitaire pour validation rapide
 */
export function validateMifpdi(mifpdi: string): MifpdiValidationResult {
  return mifpdiValidator.validateMifpdi(mifpdi);
}

/**
 * Fonction utilitaire pour extraire le code commune
 */
export function extractCommuneFromMifpdi(mifpdi: string): string | null {
  return mifpdiValidator.extractCommuneCode(mifpdi);
}

/**
 * Détecte si un texte contient un MIFPDI valide
 */
export function detectMifpdiInText(text: string): MifpdiValidationResult | null {
  // Patterns pour détecter MIFPDI dans du texte libre
  const mifpdiPatterns = [
    /\b\d{3,5}\/\d{1,5}\.?\d{0,5}\/\d{4}\b/g,
    /\b\d{3,5}\/\d{1,5}\/\d{4}\b/g
  ];

  for (const pattern of mifpdiPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const validation = validateMifpdi(match);
        if (validation.isValid) {
          return validation;
        }
      }
    }
  }

  return null;
}