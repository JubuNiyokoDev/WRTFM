/**
 * Correction lexicale post-OCR des champs à vocabulaire fermé.
 *
 * PaddleOCR lit le texte imprimé à ~100 % mais déforme le manuscrit
 * (RUTIGI pour RUYIGI, ELEYX pour ELEVE, OIL pour OYA…). Pour les champs
 * dont les valeurs possibles sont connues — provinces, statut marital,
 * professions courantes, titre de l'émetteur — on corrige par distance
 * d'édition vers l'entrée la plus proche du lexique.
 *
 * Les champs à vocabulaire ouvert (noms propres, collines de naissance)
 * ne sont jamais touchés : mieux vaut une erreur OCR visible qu'une
 * correction inventée.
 */

import { BurundiPersonalFields, BurundiOfficialFields } from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// LEXIQUES
// ═══════════════════════════════════════════════════════════════════════════════

/** Les 18 provinces du Burundi */
const BURUNDI_PROVINCES = [
  "BUBANZA",
  "BUJUMBURA",
  "BUJUMBURA MAIRIE",
  "BUJUMBURA RURAL",
  "BURURI",
  "CANKUZO",
  "CIBITOKE",
  "GITEGA",
  "KARUZI",
  "KAYANZA",
  "KIRUNDO",
  "MAKAMBA",
  "MURAMVYA",
  "MUYINGA",
  "MWARO",
  "NGOZI",
  "RUMONGE",
  "RUTANA",
  "RUYIGI",
] as const;

/** ARUBATSE (marié·e ?) : réponses attendues en kirundi */
const MARITAL_VALUES = ["OYA", "EGO"] as const;

/** Professions courantes rencontrées sur les livrets (FR + kirundi) */
const COMMON_PROFESSIONS = [
  "ELEVE",
  "ETUDIANT",
  "ETUDIANTE",
  "UMUNYESHURE",
  "UMURIMYI",
  "CULTIVATEUR",
  "CULTIVATRICE",
  "UMUDANDAZA",
  "COMMERCANT",
  "COMMERCANTE",
  "UMWIGISHA",
  "ENSEIGNANT",
  "ENSEIGNANTE",
  "CHAUFFEUR",
  "MENUISIER",
  "MACON",
  "COUTURIER",
  "COUTURIERE",
  "NTARUBAKA",
] as const;

/** UWUYITANZE : titre de l'autorité émettrice */
const ISSUER_TITLES = ["MUSITANTERI", "UMUSITANTERI", "ADMINISTRATEUR"] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// DISTANCE D'ÉDITION
// ═══════════════════════════════════════════════════════════════════════════════

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = curr[j];
  }
  return prev[cols - 1];
}

export interface FieldCorrection {
  field: string;
  raw: string;
  corrected: string;
  distance: number;
}

/**
 * Cherche l'entrée du lexique la plus proche de la valeur OCR.
 * Accepte la correction si la distance ≤ maxDistance(longueur).
 */
function correctFromLexicon(
  value: string | undefined,
  lexicon: readonly string[],
  maxDistance: (length: number) => number,
): { value: string | undefined; distance: number } {
  if (!value) return { value, distance: 0 };
  const cleaned = value.toUpperCase().replace(/[^A-ZÀ-Ý ]/g, "").trim();
  if (cleaned.length < 3) return { value, distance: 0 };

  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of lexicon) {
    const d = levenshtein(cleaned, entry);
    if (d < bestDistance) {
      bestDistance = d;
      best = entry;
    }
  }

  if (best !== undefined && bestDistance <= maxDistance(cleaned.length)) {
    return { value: best, distance: bestDistance };
  }
  return { value, distance: 0 };
}

/** Tolérance standard : ~40 % de la longueur, au moins 1 */
const standardTolerance = (length: number) => Math.max(1, Math.floor(length * 0.4));

/** Tolérance courte pour OYA/EGO : valeurs ≤ 4 lettres uniquement */
const maritalTolerance = (length: number) => (length <= 4 ? 2 : 0);

function correctIssuerTitlePrefix(value: string | undefined): { value: string | undefined; distance: number } {
  if (!value) return { value, distance: 0 };
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return { value, distance: 0 };

  const first = parts[0];
  const { value: correctedTitle, distance } = correctFromLexicon(
    first,
    ISSUER_TITLES,
    standardTolerance,
  );
  if (!correctedTitle || correctedTitle === first) return { value, distance: 0 };
  return {
    value: [correctedTitle, ...parts.slice(1)].join(" "),
    distance,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALISATION DES CHAMPS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Corrige en place les champs à vocabulaire fermé et retourne la liste des
 * corrections appliquées. Les noms propres (izina, amatazirano, se, nyina)
 * et le lieu de naissance (yavukiye, vocabulaire ouvert des collines) ne
 * sont jamais modifiés.
 */
export function normalizeExtractedFields(
  personalFields: BurundiPersonalFields,
  officialFields: BurundiOfficialFields,
): FieldCorrection[] {
  const corrections: FieldCorrection[] = [];

  const apply = (
    field: string,
    raw: string | undefined,
    lexicon: readonly string[],
    tolerance: (length: number) => number,
  ): string | undefined => {
    const { value, distance } = correctFromLexicon(raw, lexicon, tolerance);
    if (raw && value && value !== raw) {
      corrections.push({ field, raw, corrected: value, distance });
    }
    return value;
  };

  personalFields.provensi = apply(
    "provensi",
    personalFields.provensi,
    BURUNDI_PROVINCES,
    standardTolerance,
  );
  personalFields.arubatse = apply(
    "arubatse",
    personalFields.arubatse,
    MARITAL_VALUES,
    maritalTolerance,
  );
  personalFields.akaziAkora = apply(
    "akaziAkora",
    personalFields.akaziAkora,
    COMMON_PROFESSIONS,
    standardTolerance,
  );
  const rawIssuer = officialFields.uwuyitanze;
  const issuerCorrection = correctIssuerTitlePrefix(rawIssuer);
  if (rawIssuer && issuerCorrection.value && issuerCorrection.value !== rawIssuer) {
    corrections.push({
      field: "uwuyitanze",
      raw: rawIssuer,
      corrected: issuerCorrection.value,
      distance: issuerCorrection.distance,
    });
  }
  officialFields.uwuyitanze = issuerCorrection.value;

  return corrections;
}
