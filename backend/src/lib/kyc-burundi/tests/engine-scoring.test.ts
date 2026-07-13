/**
 * Tests du score global pondéré (computeWeightedKycScore)
 * Valeurs issues d'un run réel du pipeline sur les images de test.
 */

import { describe, it, expect } from 'vitest';
import { computeWeightedKycScore } from '../engine';
import { DEFAULT_BURUNDI_KYC_CONFIG, BurundiKycVerificationResult } from '../types';

const weights = DEFAULT_BURUNDI_KYC_CONFIG.weights;

// Run réel du 2026-07-07 : tous les contrôles individuels passent
const realRunResults = {
  ocr: { confidence: 86.667 },
  triangleCoherence: { confidence: 85 },
  stampComparison: { similarity: 0.783759495657827 },
  stampContinuity: { confidence: 100 },
  fingerprintDetection: { confidence: 50 },
  faceMatching: { similarity: 0.6169, threshold: 0.363 },
} as Partial<BurundiKycVerificationResult>;

describe('computeWeightedKycScore', () => {
  it('approuve un document réel dont tous les contrôles passent', () => {
    const score = computeWeightedKycScore(realRunResults, weights);
    // Similarité faciale 0.62 avec seuil 0.363 = match fort (~85/100 normalisé),
    // pas 62/100 : le score global doit dépasser le seuil d'approbation de 80.
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('donne ~50 au visage quand la similarité est pile au seuil', () => {
    const borderline = {
      ...realRunResults,
      faceMatching: { similarity: 0.363, threshold: 0.363 },
    } as Partial<BurundiKycVerificationResult>;
    const strong = computeWeightedKycScore(realRunResults, weights);
    const weak = computeWeightedKycScore(borderline, weights);
    // Un match limite doit peser nettement moins qu'un match fort
    expect(weak).toBeLessThan(strong);
    expect(weak).toBeLessThan(80);
  });

  it('plafonne le score facial à 100 pour une similarité très élevée', () => {
    const perfect = {
      ...realRunResults,
      faceMatching: { similarity: 0.95, threshold: 0.363 },
    } as Partial<BurundiKycVerificationResult>;
    const score = computeWeightedKycScore(perfect, weights);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('retombe sur similarité×100 sans seuil calibré', () => {
    const noThreshold = {
      ...realRunResults,
      faceMatching: { similarity: 0.6169, threshold: 0 },
    } as Partial<BurundiKycVerificationResult>;
    const score = computeWeightedKycScore(noThreshold, weights);
    // 61.69 × 0.15 ≈ 9.25 au lieu de ~12.7 : score global sous 80
    expect(score).toBeLessThan(80);
  });
});
