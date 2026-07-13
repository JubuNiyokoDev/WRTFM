/**
 * Tests réels pour les modules visuels:
 * - triangle-coherence.ts
 * - stamp-continuity.ts
 * - fingerprint-detector.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Jimp } from 'jimp';
import { BurundiOCR } from '../ocr';
import { TriangleCoherenceValidator } from '../triangle-coherence';
import { StampContinuityDetector } from '../stamp-continuity';
import { FingerprintDetector } from '../fingerprint-detector';

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP - CHARGEMENT IMAGES RÉELLES
// ═══════════════════════════════════════════════════════════════════════════════

let frontImageBuffer: Buffer;
let backImageBuffer: Buffer;

beforeAll(async () => {
  const frontImagePath = path.join(process.cwd(), '../frontend/public/Sized-front-id.jpeg');
  const backImagePath = path.join(process.cwd(), '../frontend/public/Sized-back-id.jpeg');

  frontImageBuffer = await fs.readFile(frontImagePath);
  backImageBuffer = await fs.readFile(backImagePath);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS MODULE 3: TRIANGLE DE COHÉRENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('TriangleCoherenceValidator', () => {
  const ocr = new BurundiOCR();
  const validator = new TriangleCoherenceValidator();

  it('devrait valider la cohérence de commune sur les vraies images', async () => {
    const ocrResult = await ocr.extractAllFields(frontImageBuffer, backImageBuffer);
    const image = await Jimp.read(frontImageBuffer);
    const photoStampRegion = image.crop({ x: 1800, y: 500, w: 800, h: 800 });
    const photoStampBuffer = await photoStampRegion.getBuffer('image/jpeg');
    const result = await validator.validateTriangle(ocrResult, photoStampBuffer);

    expect(result.confidence).toBeGreaterThan(60);
    expect(result.isCoherent).toBe(true);

    console.log('[Test Triangle] Résultat cohérence:', {
      isCoherent: result.isCoherent,
      commune: result.commune,
      normalized: result.normalizedCommune
    });
  }, 240000); // Augmenté pour OCR (2 faces + OCR tampon)
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS MODULE 5: CONTINUITÉ DU TAMPON
// ═══════════════════════════════════════════════════════════════════════════════

describe('StampContinuityDetector', () => {
  const detector = new StampContinuityDetector();

  it('devrait détecter la continuité du tampon sur la vraie image recto', async () => {
    const result = await detector.checkContinuity(frontImageBuffer);
    expect(result.hasContinuity).toBe(true);
    expect(result.confidence).toBeGreaterThan(50);
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS MODULE 6: DÉTECTION EMPREINTE
// ═══════════════════════════════════════════════════════════════════════════════

describe('FingerprintDetector', () => {
  const detector = new FingerprintDetector();

  it('devrait détecter la présence de l\'empreinte digitale sur la vraie image recto', async () => {
    const result = await detector.detectFingerprint(frontImageBuffer);
    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThan(40);
    expect(result.isBlueInk).toBe(true);
  }, 15000);
});
