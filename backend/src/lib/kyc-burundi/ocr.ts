/**
 * Module 1: OCR structuré pour documents burundais
 * Extrait les champs Kirundi en utilisant les libellés comme ancres spatiales
 * — chaque valeur est extraite uniquement depuis la zone bornée près de son ancre.
 */

import {
  BurundiPersonalFields,
  BurundiOfficialFields,
  BurundiOCRResult,
  BurundiKycConfig,
  BurundiKycError,
  KYC_ERROR_CODES,
  DEFAULT_BURUNDI_KYC_CONFIG,
} from "./types";
import { normalizeExtractedFields } from "./field-normalizer";

const KYC_VISION_SERVICE_URL =
  process.env.KYC_VISION_SERVICE_URL ?? "http://localhost:5010";
const OCR_HTTP_TIMEOUT_MS = Number(process.env.KYC_OCR_TIMEOUT_MS ?? "120000");

// ═══════════════════════════════════════════════════════════════════════════════
// ANCRES KIRUNDI
// ═══════════════════════════════════════════════════════════════════════════════

const KIRUNDI_ANCHORS = {
  IZINA: ["IZINA"],
  AMATAZIRANO: ["AMATAZIRANO", "AMATAZIRAÑO"],
  SE: ["SE", "S"],
  NYINA: ["NYINA"],
  PROVENSI: ["PROVENSI"],
  KOMINE: ["KOMINE"],
  YAVUKIYE: ["YAVUKIYE"],
  ITALIKI: ["ITALIKI"],
  ARUBATSE: ["ARUBATSE"],
  AKAZI_AKORA: ["AKAZI", "AKAZIAKORA"],
  NUMERO_MIFPDI: ["MIFPDI", "MIFPDL"],
  ITANGIWE_I: ["ITANGIWE"],
  UWUYITANZE: ["UWUYITANZE"],
  IGIKUMU: ["IGIKUMU"],
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// WORD BBOX — représentation d'un mot avec ses coordonnées
// ═══════════════════════════════════════════════════════════════════════════════

interface WordBox {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
}

interface VisionOcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
}

interface VisionOcrLine {
  text: string;
  confidence: number;
  box: number[] | number[][];
}

interface VisionOcrResponse {
  text: string;
  confidence: number;
  lines?: VisionOcrLine[];
  words: VisionOcrWord[];
  metrics?: unknown;
  cleanup?: unknown;
  elapsed_ms?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION SPATIALE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cherche l'ancre dans la liste de mots, éventuellement en excluant les mots trop bas
 * (pour éviter les en-têtes de tableau en bas de page).
 */
function findAnchorWord(
  words: WordBox[],
  anchors: readonly string[],
  maxTop?: number, // si défini, ignore les mots plus bas que cette valeur
): WordBox | null {
  for (const anchor of anchors) {
    const upper = anchor.toUpperCase();
    // On cherche d'abord une correspondance exacte, puis partielle
    for (const w of words) {
      if (maxTop !== undefined && w.top > maxTop) continue;
      if (w.text.toUpperCase() === upper && w.conf >= 0) return w;
    }
    for (const w of words) {
      if (maxTop !== undefined && w.top > maxTop) continue;
      if (w.text.toUpperCase().includes(upper) && w.conf >= 0) return w;
    }
  }
  return null;
}

/**
 * Extrait la valeur associée à une ancre :
 * — cherche les mots à droite de l'ancre sur la même ligne (±30px en Y)
 * — si rien à droite, cherche la ligne suivante (dans les 120px en dessous)
 * — ne dépasse jamais 600px à droite ou en dessous (évite de déborder sur d'autres champs)
 */
function extractValueNearAnchor(
  anchorWord: WordBox,
  words: WordBox[],
  options?: {
    maxDeltaY?: number; // tolérance verticale pour "même ligne" (défaut: 40px)
    maxNextLineY?: number; // distance max pour "ligne suivante" (défaut: 120px)
    maxRightX?: number; // limite droite en pixels (défaut: anchor.left + 800)
    minConf?: number; // confiance minimale des mots retenus (défaut: 10)
    logLabel?: string;
    consumed?: Set<WordBox>;
  },
): string {
  const maxDeltaY = options?.maxDeltaY ?? 40;
  const maxNextLineY = options?.maxNextLineY ?? 120;
  const maxRightX =
    options?.maxRightX ?? anchorWord.left + anchorWord.width + 800;
  const minConf = options?.minConf ?? 10;
  const anchorRight = anchorWord.left + anchorWord.width;

  const markConsumed = (selected: WordBox[], value: string) => {
    if (value && options?.consumed) {
      for (const word of selected) options.consumed.add(word);
    }
    return value;
  };

  // Mots sur la même ligne, à droite
  const sameLine = words
    .filter(
      (w) =>
        w !== anchorWord &&
        !options?.consumed?.has(w) &&
        Math.abs(w.top - anchorWord.top) <= maxDeltaY &&
        w.left >= anchorRight &&
        w.left <= maxRightX &&
        w.conf >= minConf,
    )
    .sort((a, b) => a.left - b.left);

  if (sameLine.length > 0) {
    const value = sameLine
      .map((w) => w.text)
      .join(" ")
      .trim();
    // Nettoyer les séparateurs de tête (:, -, _)
    return markConsumed(sameLine, value.replace(/^[\s:_\-\.]+/, "").trim());
  }

  // Ligne suivante (en dessous, même colonne approximative)
  const nextLine = words
    .filter(
      (w) =>
        w.top > anchorWord.top &&
        !options?.consumed?.has(w) &&
        w.top <= anchorWord.top + maxNextLineY &&
        w.left >= anchorWord.left - 50 &&
        w.left <= maxRightX &&
        w.conf >= minConf,
    )
    .sort((a, b) => a.left - b.left);

  if (nextLine.length > 0) {
    const value = nextLine
      .map((w) => w.text)
      .join(" ")
      .trim()
      .replace(/^[\s:_\-\.]+/, "")
      .trim();
    return markConsumed(nextLine, value);
  }

  return "";
}

function extractLongValueFromAnchorLine(
  lines: VisionOcrLine[],
  anchors: readonly string[],
): string | undefined {
  const anchorPattern = new RegExp(
    `\\b(?:${anchors.map((anchor) => anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b[\\s:._-]*`,
    "i",
  );
  const line = lines.find((candidate) => anchorPattern.test(candidate.text));
  if (!line) return undefined;
  const value = cleanExtractedValue(line.text.replace(anchorPattern, ""));
  return value && value.length >= 3 ? value : undefined;
}

function extractUwuyitanzeLongValue(lines: VisionOcrLine[]): string | undefined {
  const anchorLine = findAnchorLine(lines, KIRUNDI_ANCHORS.UWUYITANZE);
  const anchor = anchorLine ? lineBounds(anchorLine) : null;
  if (!anchor) return undefined;

  const selected = lines
    .map((line) => ({ line, bounds: lineBounds(line) }))
    .filter(({ line, bounds }) => {
      if (!bounds || line === anchorLine) return false;
      if (line.confidence < 70) return false;
      if (NOISE_WORD_RE.test(line.text)) return false;
      const upper = line.text.toUpperCase();
      if (/(KOMINE|COMMUNE|GITEGA|REPUBLIQUE|BURUNDI|ITANGIWE|ITALIKI|MIFP|IKARATA)/.test(upper)) {
        return false;
      }

      const sameLineRight =
        Math.abs(bounds.top - anchor.top) <= 95 && bounds.left >= anchor.right - 30;
      const nextNameLine =
        bounds.top > anchor.bottom + 120 &&
        bounds.top <= anchor.bottom + 360 &&
        bounds.left >= anchor.left &&
        /(?:\bDR\b|NDUW|JAC|PAC|MUSIT|[A-ZÀ-ÖØ-Þ]{5,})/i.test(line.text);
      return sameLineRight || nextNameLine;
    })
    .sort((a, b) => a.bounds!.top - b.bounds!.top || a.bounds!.left - b.bounds!.left);

  const value = cleanExtractedValue(selected.map(({ line }) => line.text).join(" "));
  return value && value.length >= 3 ? value : undefined;
}

function extractUwuyitanzeFromWords(anchorWord: WordBox | null, words: WordBox[]): string | undefined {
  if (!anchorWord) return undefined;
  const anchorRight = anchorWord.left + anchorWord.width;
  const isIssuerNoise = (text: string) =>
    /(KOMINE|COMMUNE|COURCUNE|GITEGA|REPUBLIQUE|BURUNDI|ITANGIWE|ITALIKI|MIFP|IKARATA|PUBL)/i.test(text) ||
    NOISE_WORD_RE.test(text);

  const sameLine = words.filter((word) => {
    if (word === anchorWord || word.conf < 50 || isIssuerNoise(word.text)) return false;
    return Math.abs(word.top - anchorWord.top) <= 90 && word.left >= anchorRight - 30;
  });

  const nextNameLine = words.filter((word) => {
    if (word === anchorWord || word.conf < 70 || isIssuerNoise(word.text)) return false;
    if (word.top <= anchorWord.top + 240 || word.top > anchorWord.top + 520) return false;
    if (word.left < anchorWord.left) return false;
    return /(?:\bDR\b|NDUW|JAC|PAC|MUSIT|[A-ZÀ-ÖØ-Þ]{5,})/i.test(word.text);
  });

  const selected = [...sameLine, ...nextNameLine].sort(
    (a, b) => a.top - b.top || a.left - b.left,
  );
  const value = cleanExtractedValue(selected.map((word) => word.text).join(" "));
  return value && value.length >= 3 ? value : undefined;
}

const NOISE_WORD_RE = /^[\W_•.…·\-:]+$/u;
const MIFPDI_NUMBER_RE = /\b\d{3,6}\/\d{2,4}[./]\d{2,4}\/\d{4}\b/;
const FIELD_VALUE_RE = /[A-ZÀ-ÖØ-Þ]{3,}|\d{4}/i;

function isAnchorLike(text: string): boolean {
  const upper = text.toUpperCase();
  return Object.values(KIRUNDI_ANCHORS)
    .flat()
    .some((anchor) => upper === anchor || upper.includes(anchor));
}

function cleanExtractedValue(value: string): string | undefined {
  const cleaned = value
    .replace(/[•…·]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:_\-.]+/, "")
    .trim();
  if (!cleaned || cleaned.length < 2) return undefined;
  return cleaned;
}

function lineBounds(line: VisionOcrLine): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
} | null {
  const box = line.box;
  if (!Array.isArray(box) || box.length === 0) return null;

  if (typeof box[0] === "number") {
    const [left, top, right, bottom] = box as number[];
    if ([left, top, right, bottom].some((value) => typeof value !== "number")) {
      return null;
    }
    return {
      left,
      top,
      right,
      bottom,
      centerX: (left + right) / 2,
    };
  }

  const points = (box as number[][]).filter(
    (point) => Array.isArray(point) && point.length >= 2,
  );
  if (points.length === 0) return null;

  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
  };
}

function findAnchorLine(
  lines: VisionOcrLine[],
  anchors: readonly string[],
  maxTop = Number.POSITIVE_INFINITY,
): VisionOcrLine | null {
  for (const anchor of anchors) {
    const upper = anchor.toUpperCase();
    const exact = lines.find((line) => {
      const bounds = lineBounds(line);
      const text = line.text.toUpperCase();
      const minConfidence = upper.length <= 2 ? 60 : 60;
      return (
        bounds &&
        bounds.top <= maxTop &&
        text === upper &&
        line.confidence >= minConfidence
      );
    });
    if (exact) return exact;
  }

  for (const anchor of anchors) {
    const upper = anchor.toUpperCase();
    const partial = lines.find((line) => {
      const bounds = lineBounds(line);
      const text = line.text.toUpperCase();
      if (upper.length <= 2 && text !== upper) return false;
      return (
        bounds &&
        bounds.top <= maxTop &&
        text.includes(upper) &&
        line.confidence >= 60
      );
    });
    if (partial) return partial;
  }

  return null;
}

function extractValueBelowLine(
  anchorLine: VisionOcrLine | null,
  lines: VisionOcrLine[],
  maxY: number,
  options?: {
    columnTolerance?: number;
    minConf?: number;
    maxVerticalGap?: number;
    maxLines?: number;
    consumed?: Set<VisionOcrLine>;
  },
): string | undefined {
  if (!anchorLine) return undefined;
  const anchor = lineBounds(anchorLine);
  if (!anchor) return undefined;

  const columnTolerance = options?.columnTolerance ?? 135;
  const minConf = options?.minConf ?? 70;
  const maxVerticalGap = options?.maxVerticalGap ?? 760;
  const maxLines = options?.maxLines ?? 2;

  const candidates = lines
    .map((line) => ({ line, bounds: lineBounds(line) }))
    .filter(({ line, bounds }) => {
      if (!bounds || line === anchorLine) return false;
      if (options?.consumed?.has(line)) return false;
      if (bounds.top <= anchor.top + 45 || bounds.top >= maxY) return false;
      if (bounds.top - anchor.top > maxVerticalGap) return false;
      if (line.confidence < minConf) return false;
      if (!FIELD_VALUE_RE.test(line.text)) return false;
      if (NOISE_WORD_RE.test(line.text)) return false;
      if (isAnchorLike(line.text)) return false;
      return Math.abs(bounds.centerX - anchor.centerX) <= columnTolerance;
    })
    .sort((a, b) => {
      const aDistance =
        Math.abs(a.bounds!.centerX - anchor.centerX) * 2 +
        Math.abs(a.bounds!.top - anchor.top);
      const bDistance =
        Math.abs(b.bounds!.centerX - anchor.centerX) * 2 +
        Math.abs(b.bounds!.top - anchor.top);
      return aDistance - bDistance;
    });

  if (candidates.length === 0) return undefined;

  const selected = candidates
    .slice(0, maxLines)
    .sort((a, b) => a.bounds!.top - b.bounds!.top);

  const value = cleanExtractedValue(
    selected.map(({ line }) => line.text).join(" "),
  );
  if (value && options?.consumed) {
    for (const { line } of selected) options.consumed.add(line);
  }
  return value;
}

function extractValueRightOfLine(
  anchorLine: VisionOcrLine | null,
  lines: VisionOcrLine[],
  maxY: number,
  options?: {
    minConf?: number;
    maxDeltaY?: number;
    maxHorizontalGap?: number;
    maxLines?: number;
    consumed?: Set<VisionOcrLine>;
  },
): string | undefined {
  if (!anchorLine) return undefined;
  const anchor = lineBounds(anchorLine);
  if (!anchor || anchor.top >= maxY) return undefined;
  const anchorWidth = Math.max(anchor.right - anchor.left, 1);
  const anchorHeight = Math.max(anchor.bottom - anchor.top, 1);
  if (anchorHeight > anchorWidth * 2) return undefined;

  const minConf = options?.minConf ?? 70;
  const maxDeltaY = options?.maxDeltaY ?? Math.max(55, anchor.bottom - anchor.top);
  const maxHorizontalGap = options?.maxHorizontalGap ?? 900;
  const maxLines = options?.maxLines ?? 2;

  const candidates = lines
    .map((line) => ({ line, bounds: lineBounds(line) }))
    .filter(({ line, bounds }) => {
      if (!bounds || line === anchorLine) return false;
      if (options?.consumed?.has(line)) return false;
      if (bounds.top >= maxY) return false;
      if (Math.abs(bounds.top - anchor.top) > maxDeltaY) return false;
      if (bounds.left < anchor.right) return false;
      if (bounds.left - anchor.right > maxHorizontalGap) return false;
      if (line.confidence < minConf) return false;
      if (!FIELD_VALUE_RE.test(line.text)) return false;
      if (NOISE_WORD_RE.test(line.text)) return false;
      if (isAnchorLike(line.text)) return false;
      return true;
    })
    .sort((a, b) => a.bounds!.left - b.bounds!.left);

  if (candidates.length === 0) return undefined;
  const selected = candidates.slice(0, maxLines);
  const value = cleanExtractedValue(
    selected.map(({ line }) => line.text).join(" "),
  );
  if (value && options?.consumed) {
    for (const { line } of selected) options.consumed.add(line);
  }
  return value;
}

/**
 * Le livret burundais réel a souvent les libellés en haut et les valeurs
 * écrites dessous dans une colonne verticale. Cette extraction complète le
 * mode "valeur à droite" sans le remplacer.
 */
function extractValueBelowColumn(
  anchorWord: WordBox,
  words: WordBox[],
  options?: {
    maxY?: number;
    columnTolerance?: number;
    minConf?: number;
    maxWords?: number;
    consumed?: Set<WordBox>;
  },
): string | undefined {
  const anchorCenterX = anchorWord.left + anchorWord.width / 2;
  const maxY = options?.maxY ?? Number.POSITIVE_INFINITY;
  const columnTolerance = options?.columnTolerance ?? 130;
  const minConf = options?.minConf ?? 50;
  const maxWords = options?.maxWords ?? 3;

  const candidates = words
    .filter((word) => {
      if (word === anchorWord) return false;
      if (options?.consumed?.has(word)) return false;
      if (word.top <= anchorWord.top + 35 || word.top >= maxY) return false;
      if (word.conf < minConf) return false;
      if (NOISE_WORD_RE.test(word.text)) return false;
      if (isAnchorLike(word.text)) return false;

      const centerX = word.left + word.width / 2;
      return Math.abs(centerX - anchorCenterX) <= columnTolerance;
    })
    .sort((a, b) => a.top - b.top || a.left - b.left);

  if (candidates.length === 0) return undefined;

  const selected: WordBox[] = [];
  for (const candidate of candidates) {
    if (selected.length >= maxWords) break;
    if (selected.length > 0) {
      const previous = selected[selected.length - 1];
      if (candidate.top - previous.top > 650) break;
    }
    selected.push(candidate);
  }

  const value = cleanExtractedValue(selected.map((word) => word.text).join(" "));
  if (value && options?.consumed) {
    for (const word of selected) options.consumed.add(word);
  }
  return value;
}

function extractMifpdiNumber(words: WordBox[], anchorWord: WordBox | null): string | undefined {
  const matchingWords = words
    .filter((word) => MIFPDI_NUMBER_RE.test(word.text))
    .sort((a, b) => b.conf - a.conf);

  if (matchingWords.length === 0) return undefined;
  if (!anchorWord) return matchingWords[0].text.match(MIFPDI_NUMBER_RE)?.[0];

  const anchorCenterX = anchorWord.left + anchorWord.width / 2;
  const nearby = matchingWords
    .filter((word) => {
      const centerX = word.left + word.width / 2;
      const verticalDistance = Math.abs(word.top - anchorWord.top);
      return Math.abs(centerX - anchorCenterX) <= 450 && verticalDistance <= 220;
    })
    .sort((a, b) => Math.abs(a.top - anchorWord.top) - Math.abs(b.top - anchorWord.top));

  return (nearby[0] ?? matchingWords[0]).text.match(MIFPDI_NUMBER_RE)?.[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE OCR BURUNDAIS
// ═══════════════════════════════════════════════════════════════════════════════

export class BurundiOCR {
  private config: BurundiKycConfig;

  constructor(config: BurundiKycConfig = DEFAULT_BURUNDI_KYC_CONFIG) {
    this.config = config;
  }

  /**
   * Extrait tous les champs du document burundais (recto + verso)
   */
  async extractAllFields(
    frontImageBuffer: Buffer,
    backImageBuffer?: Buffer,
  ): Promise<BurundiOCRResult> {
    try {
      const frontResult = await this.performOCRWithWords(
        frontImageBuffer,
        "front",
      );
      const backResult = backImageBuffer
        ? await this.performOCRWithWords(backImageBuffer, "back")
        : { text: "", confidence: 0, words: [], lines: [] as VisionOcrLine[] };

      const allWords = [...frontResult.words, ...backResult.words];
      const fullText = `${frontResult.text}\n\n${backResult.text}`;
      const avgConfidence = backImageBuffer
        ? (frontResult.confidence + backResult.confidence) / 2
        : frontResult.confidence;

      // Détection des ancres Kirundi présentes
      const anchorsFound = this.detectKirundiAnchors(fullText);

      if (anchorsFound.length === 0) {
        throw new BurundiKycError(
          "Aucune ancre Kirundi détectée - document non burundais",
          KYC_ERROR_CODES.ANCHORS_NOT_FOUND,
          { text: fullText },
        );
      }

      // Extraction spatiale des champs (relevantLines collecte les lignes
      // d'ancres et de valeurs réellement utilisées)
      const relevantLines = new Set<VisionOcrLine>();
      const personalFields = this.extractPersonalFields(
        frontResult.words,
        frontResult.lines,
        relevantLines,
      );
      const officialFields = this.extractOfficialFields(
        backResult.words.length > 0 ? backResult.words : frontResult.words,
        backResult.lines.length > 0 ? backResult.lines : frontResult.lines,
      );

      for (const line of backResult.lines) {
        if (isAnchorLike(line.text) || MIFPDI_NUMBER_RE.test(line.text)) {
          relevantLines.add(line);
        }
      }

      // Correction lexicale des champs à vocabulaire fermé (provinces,
      // OYA/EGO, professions, titre émetteur) — jamais les noms propres
      const lexiconCorrections = normalizeExtractedFields(
        personalFields,
        officialFields,
      );
      if (lexiconCorrections.length > 0) {
        console.log(
          "[KYC OCR] Corrections lexicales:",
          lexiconCorrections
            .map((c) => `${c.field}: ${c.raw} → ${c.corrected}`)
            .join(", "),
        );
      }

      // La moyenne brute inclut tampons, empreintes et bruit qui plombent le
      // score d'un document authentique : la confiance décisionnelle se base
      // sur les lignes utiles quand elles sont assez nombreuses.
      const relevant = [...relevantLines];
      const fieldConfidence =
        relevant.length >= 3
          ? relevant.reduce((sum, line) => sum + line.confidence, 0) /
            relevant.length
          : 0;
      const confidence =
        Math.round(Math.max(avgConfidence, fieldConfidence) * 1000) / 1000;
      console.log(
        `[KYC OCR] confiance brute=${avgConfidence.toFixed(1)}% | lignes utiles=${relevant.length} | confiance champs=${fieldConfidence.toFixed(1)}%`,
      );

      const detectedLanguage = this.detectLanguage(fullText);

      const stampZoneText = this.extractStampZoneText(frontResult.lines);

      // Logging des coordonnées pour diagnostic
      this.logAnchorCoordinates(frontResult.words, "front");

      return {
        personalFields,
        officialFields,
        confidence,
        detectedLanguage,
        anchorsFound,
        stampZoneText,
      };
    } catch (error) {
      if (error instanceof BurundiKycError) throw error;
      throw new BurundiKycError(
        `Erreur OCR: ${(error as Error).message}`,
        KYC_ERROR_CODES.OCR_FAILED,
        error,
      );
    }
  }

  /**
   * OCR avec extraction des mots et leurs bounding boxes via le microservice PaddleOCR.
   */
  private async performOCRWithWords(
    imageBuffer: Buffer,
    side = "unknown",
  ): Promise<{
    text: string;
    confidence: number;
    words: WordBox[];
    lines: VisionOcrLine[];
  }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
    formData.append("image", blob, `${side}.jpg`);
    formData.append("side", side);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(`${KYC_VISION_SERVICE_URL}/ocr-burundi`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new BurundiKycError(
          `KYC Vision Service /ocr-burundi erreur ${response.status}: ${text}`,
          KYC_ERROR_CODES.OCR_FAILED,
        );
      }

      const result = (await response.json()) as VisionOcrResponse;
      const words: WordBox[] = (result.words ?? []).map((word) => ({
        text: word.text,
        left: word.left,
        top: word.top,
        width: word.width,
        height: word.height,
        conf: word.conf,
      }));

      return {
        text: result.text ?? "",
        confidence: result.confidence ?? 0,
        lines: result.lines ?? [],
        words,
      };
    } catch (error) {
      if (error instanceof BurundiKycError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new BurundiKycError(
        `KYC Vision Service inaccessible pour /ocr-burundi: ${msg}. Lancez: cd backend/kyc-vision-service && uvicorn main:app --port 5010`,
        KYC_ERROR_CODES.OCR_FAILED,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Texte OCR de la zone IKASHE (tampon du recto) : lignes entre l'ancre
   * IKASHE et le tableau de résidence. Le microservice /stamp-ocr échoue
   * souvent sur l'encre du tampon alors que l'OCR pleine page le lit bien ;
   * ce texte sert de source de secours au triangle de cohérence.
   */
  private extractStampZoneText(lines: VisionOcrLine[]): string | undefined {
    const ikashe = lines.find(
      (line) => line.text.toUpperCase().includes("IKASHE") && line.confidence >= 60,
    );
    const ikasheBounds = ikashe ? lineBounds(ikashe) : null;
    if (!ikasheBounds) return undefined;

    const aho = lines.find((line) => line.text.toUpperCase().startsWith("AHO"));
    const ahoBounds = aho ? lineBounds(aho) : null;
    const zoneBottom = ahoBounds ? ahoBounds.top : Number.POSITIVE_INFINITY;

    const zoneLines = lines
      .map((line) => ({ line, bounds: lineBounds(line) }))
      .filter(
        ({ line, bounds }) =>
          bounds &&
          bounds.top > ikasheBounds.top &&
          bounds.top < zoneBottom &&
          line.confidence >= 50 &&
          !NOISE_WORD_RE.test(line.text),
      )
      .sort((a, b) => a.bounds!.top - b.bounds!.top)
      .map(({ line }) => line.text.trim());

    const text = zoneLines.join(" ").replace(/\s+/g, " ").trim();
    return text.length >= 3 ? text : undefined;
  }

  /**
   * Log les coordonnées des ancres trouvées pour diagnostic
   */
  private logAnchorCoordinates(words: WordBox[], side: string): void {
    const allAnchors = Object.values(KIRUNDI_ANCHORS).flat();
    for (const w of words) {
      const upper = w.text.toUpperCase();
      if (allAnchors.some((a) => upper === a || upper.includes(a))) {
        console.log(
          `[KYC OCR ${side}] Ancre '${w.text}' at left=${w.left} top=${w.top} conf=${w.conf.toFixed(0)}`,
        );
      }
    }
  }

  /**
   * Extrait les champs de la page personnelle avec extraction spatiale bornée.
   *
   * Sur le document burundais (3000x4000px), la section personnelle est dans
   * la moitié supérieure. Le tableau AHO YIKWIRIKIRANIJE KUBA commence vers
   * top≈2600 — on borne la recherche des ancres personnelles en dessous de ce seuil.
   */
  private extractPersonalFields(
    words: WordBox[],
    lines: VisionOcrLine[] = [],
    relevantLines?: Set<VisionOcrLine>,
  ): BurundiPersonalFields {
    // Estimer la hauteur du document pour calibrer le seuil
    const maxTop =
      words.length > 0 ? Math.max(...words.map((w) => w.top + w.height)) : 4000;

    // Trouver l'ancre AHO pour calibrer le seuil de façon précise
    const ahoWord = words.find((w) => w.text.toUpperCase() === "AHO");
    const residenceTableTop = ahoWord ? ahoWord.top - 30 : maxTop + 50;

    // Chaque ligne/mot ne peut alimenter qu'un seul champ : sans cette
    // exclusivité, une unique ligne manuscrite lisible est réutilisée par
    // toutes les ancres dont la zone la recouvre.
    const consumedLines = relevantLines ?? new Set<VisionOcrLine>();
    const consumedWords = new Set<WordBox>();

    const fieldSpecs: Array<{
      key: keyof BurundiPersonalFields;
      label: string;
      anchors: readonly string[];
      minConf: number;
      columnTolerance: number;
      maxLines: number;
    }> = [
      { key: "izina", label: "IZINA", anchors: KIRUNDI_ANCHORS.IZINA, minConf: 80, columnTolerance: 120, maxLines: 1 },
      { key: "amatazirano", label: "AMATAZIRANO", anchors: KIRUNDI_ANCHORS.AMATAZIRANO, minConf: 75, columnTolerance: 120, maxLines: 1 },
      { key: "se", label: "SE", anchors: KIRUNDI_ANCHORS.SE, minConf: 75, columnTolerance: 140, maxLines: 2 },
      { key: "nyina", label: "NYINA", anchors: KIRUNDI_ANCHORS.NYINA, minConf: 80, columnTolerance: 140, maxLines: 1 },
      { key: "provensi", label: "PROVENSI", anchors: KIRUNDI_ANCHORS.PROVENSI, minConf: 80, columnTolerance: 110, maxLines: 1 },
      { key: "komine", label: "KOMINE", anchors: KIRUNDI_ANCHORS.KOMINE, minConf: 80, columnTolerance: 95, maxLines: 1 },
      { key: "yavukiye", label: "YAVUKIYE", anchors: KIRUNDI_ANCHORS.YAVUKIYE, minConf: 70, columnTolerance: 115, maxLines: 1 },
      { key: "italiki", label: "ITALIKI", anchors: KIRUNDI_ANCHORS.ITALIKI, minConf: 80, columnTolerance: 105, maxLines: 1 },
      { key: "arubatse", label: "ARUBATSE", anchors: KIRUNDI_ANCHORS.ARUBATSE, minConf: 65, columnTolerance: 110, maxLines: 1 },
      { key: "akaziAkora", label: "AKAZI_AKORA", anchors: KIRUNDI_ANCHORS.AKAZI_AKORA, minConf: 70, columnTolerance: 105, maxLines: 1 },
    ];

    const resolved = fieldSpecs.map((spec) => {
      const anchorLine = findAnchorLine(lines, spec.anchors, residenceTableTop);
      const anchorWord = findAnchorWord(words, spec.anchors, residenceTableTop);
      const bounds = anchorLine ? lineBounds(anchorLine) : null;
      const position = bounds
        ? { top: bounds.top, centerX: bounds.centerX }
        : anchorWord
          ? { top: anchorWord.top, centerX: anchorWord.left + anchorWord.width / 2 }
          : null;
      return { spec, anchorLine, anchorWord, position };
    });

    for (const entry of resolved) {
      if (entry.anchorLine) consumedLines.add(entry.anchorLine);
    }

    // La valeur d'un champ vit entre son ancre et l'ancre suivante de la même
    // colonne : borner la zone en Y empêche une ligne lointaine de matcher.
    const zoneMaxY = (self: { top: number; centerX: number } | null): number => {
      if (!self) return residenceTableTop;
      let bound = residenceTableTop;
      for (const other of resolved) {
        if (!other.position || other.position === self) continue;
        if (
          other.position.top > self.top + 10 &&
          Math.abs(other.position.centerX - self.centerX) <= 400
        ) {
          bound = Math.min(bound, other.position.top - 5);
        }
      }
      return bound;
    };

    // Extraire dans l'ordre vertical du document : la consommation gloutonne
    // attribue ainsi chaque ligne au champ dont l'ancre est juste au-dessus.
    const order = resolved
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const aTop = a.entry.position?.top ?? Number.MAX_SAFE_INTEGER;
        const bTop = b.entry.position?.top ?? Number.MAX_SAFE_INTEGER;
        return aTop - bTop || a.index - b.index;
      });

    const values: Partial<Record<keyof BurundiPersonalFields, string>> = {};

    for (const { entry } of order) {
      const { spec, anchorLine, anchorWord, position } = entry;
      const belowMaxY = zoneMaxY(position);

      const rightValue = extractValueRightOfLine(anchorLine, lines, residenceTableTop, {
        minConf: spec.minConf,
        maxLines: spec.label === "NYINA" ? 2 : 1,
        consumed: consumedLines,
      });
      if (rightValue) {
        values[spec.key] = rightValue;
        continue;
      }

      const lineValue = extractValueBelowLine(anchorLine, lines, belowMaxY, {
        minConf: spec.minConf,
        columnTolerance: spec.columnTolerance,
        maxLines: spec.maxLines,
        consumed: consumedLines,
      });
      if (lineValue) {
        values[spec.key] = lineValue;
        continue;
      }
      if (lines.length > 0) continue;

      if (!anchorWord) continue;
      const columnValue = extractValueBelowColumn(anchorWord, words, {
        maxY: belowMaxY,
        columnTolerance: 145,
        maxWords: spec.label === "SE" || spec.label === "NYINA" ? 3 : 2,
        consumed: consumedWords,
      });
      if (columnValue) {
        values[spec.key] = columnValue;
        continue;
      }

      const nearValue = cleanExtractedValue(
        extractValueNearAnchor(anchorWord, words, {
          logLabel: spec.label,
          consumed: consumedWords,
        }),
      );
      if (nearValue) values[spec.key] = nearValue;
    }

    return {
      izina: values.izina,
      amatazirano: values.amatazirano,
      se: values.se,
      nyina: values.nyina,
      provensi: values.provensi,
      komine: values.komine,
      yavukiye: values.yavukiye,
      italiki: values.italiki,
      arubatse: values.arubatse,
      akaziAkora: values.akaziAkora,
    };
  }

  /**
   * Extrait les champs de la page émission officielle.
   * Zone D — typiquement sur le verso ou la page de droite.
   */
  private extractOfficialFields(words: WordBox[], lines: VisionOcrLine[] = []): BurundiOfficialFields {
    const findAnchor = (anchors: readonly string[]) =>
      findAnchorWord(words, anchors);

    const extract = (anchorWord: WordBox | null, label: string, options?: { maxRightX?: number; maxNextLineY?: number; maxDeltaY?: number }) => {
      if (!anchorWord) return undefined;
      const value = extractValueNearAnchor(anchorWord, words, {
        logLabel: label,
        ...options,
      });
      return cleanExtractedValue(value);
    };

    const mifpdiAnchor = findAnchor(KIRUNDI_ANCHORS.NUMERO_MIFPDI);
    const itangiweI = cleanExtractedValue(
      (extract(findAnchor(KIRUNDI_ANCHORS.ITANGIWE_I), "ITANGIWE") ?? "")
        .replace(/^I\.{0,3}\s*/i, ""),
    );

    return {
      numeroMifpdi:
        extractMifpdiNumber(words, mifpdiAnchor) ??
        extract(mifpdiAnchor, "MIFPDI"),
      itangiweI,
      italiki: extract(findAnchor(KIRUNDI_ANCHORS.ITALIKI), "ITALIKI"),
      uwuyitanze:
        extractUwuyitanzeFromWords(findAnchor(KIRUNDI_ANCHORS.UWUYITANZE), words) ??
        extractUwuyitanzeLongValue(lines) ??
        extractLongValueFromAnchorLine(lines, KIRUNDI_ANCHORS.UWUYITANZE) ??
        extract(findAnchor(KIRUNDI_ANCHORS.UWUYITANZE), "UWUYITANZE", {
          maxRightX: Number.POSITIVE_INFINITY,
          maxDeltaY: 70,
          maxNextLineY: 220,
        }),
    };
  }

  /**
   * Détecte les ancres Kirundi présentes dans le texte brut (pour la liste anchorsFound)
   */
  private detectKirundiAnchors(text: string): string[] {
    const found: string[] = [];
    const upperText = text.toUpperCase();
    for (const [_key, anchors] of Object.entries(KIRUNDI_ANCHORS)) {
      for (const anchor of anchors) {
        if (upperText.includes(anchor.toUpperCase())) {
          found.push(anchor);
          break;
        }
      }
    }
    return found;
  }

  /**
   * Détecte la langue dominante du texte OCR
   */
  private detectLanguage(text: string): "kirundi" | "french" | "mixed" {
    const kirundiKeywords = Object.values(KIRUNDI_ANCHORS).flat();
    const frenchKeywords = [
      "nom",
      "prenom",
      "date",
      "lieu",
      "nationalite",
      "profession",
    ];

    let kirundiCount = 0;
    let frenchCount = 0;
    const upperText = text.toUpperCase();

    kirundiKeywords.forEach((k) => {
      if (upperText.includes(k)) kirundiCount++;
    });
    frenchKeywords.forEach((k) => {
      if (upperText.includes(k.toUpperCase())) frenchCount++;
    });

    if (kirundiCount > frenchCount * 1.5) return "kirundi";
    if (frenchCount > kirundiCount * 1.5) return "french";
    return "mixed";
  }
}

/**
 * Fonction utilitaire pour créer une instance OCR avec config par défaut
 */
export function createBurundiOCR(
  config?: Partial<BurundiKycConfig>,
): BurundiOCR {
  const fullConfig = config
    ? { ...DEFAULT_BURUNDI_KYC_CONFIG, ...config }
    : DEFAULT_BURUNDI_KYC_CONFIG;
  return new BurundiOCR(fullConfig);
}

/**
 * Fonction d'analyse rapide pour vérifier si une image contient un document burundais
 */
export async function isLikelyBurundiDocument(
  imageBuffer: Buffer,
): Promise<boolean> {
  const ocr = createBurundiOCR();
  try {
    const result = await ocr.extractAllFields(imageBuffer);
    return result.anchorsFound.length >= 3;
  } catch (error) {
    if (
      error instanceof BurundiKycError &&
      error.code === KYC_ERROR_CODES.ANCHORS_NOT_FOUND
    ) {
      return false;
    }
    throw error;
  }
}
