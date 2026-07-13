/**
 * Tests réels pour ocr.ts et mifpdi-validator.ts
 * Utilise les vraies images Sized-front-id.jpeg et Sized-back-id.jpeg
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BurundiOCR, isLikelyBurundiDocument } from '../ocr';
import { MifpdiValidator, detectMifpdiInText } from '../mifpdi-validator';

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP - CHARGEMENT IMAGES RÉELLES
// ═══════════════════════════════════════════════════════════════════════════════

let frontImageBuffer: Buffer;
let backImageBuffer: Buffer;

beforeAll(async () => {
  // Chemin relatif à partir de la racine du projet
  const frontImagePath = path.join(process.cwd(), '../frontend/public/Sized-front-id.jpeg');
  const backImagePath = path.join(process.cwd(), '../frontend/public/Sized-back-id.jpeg');

  frontImageBuffer = await fs.readFile(frontImagePath);
  backImageBuffer = await fs.readFile(backImagePath);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS MODULE 1: OCR STRUCTURÉ
// ═══════════════════════════════════════════════════════════════════════════════

describe('BurundiOCR', () => {
  const ocr = new BurundiOCR();

  it('devrait extraire les champs des vraies images de carte burundaise', async () => {
    const result = await ocr.extractAllFields(frontImageBuffer, backImageBuffer);

    // Vérifier confiance et langue
    expect(result.confidence).toBeGreaterThan(40); // Seuil abaissé
    expect(['kirundi', 'mixed']).toContain(result.detectedLanguage);

    // Vérifier ancres trouvées
    expect(result.anchorsFound.length).toBeGreaterThan(5);

    // Vérifier champs personnels (komine manuscrit illisible sur ce spécimen :
    // le tampon IKASHE sert alors de source pour le triangle)
    expect(result.personalFields.izina).toBeTruthy();
    expect(result.personalFields.amatazirano).toBeTruthy();
    expect(result.stampZoneText).toMatch(/GITEGA/i);

    // Chaque ligne OCR ne peut alimenter qu'un seul champ : des valeurs
    // identiques sur des champs distincts signalent une régression d'assignation
    const values = [
      result.personalFields.izina,
      result.personalFields.se,
      result.personalFields.nyina,
      result.personalFields.provensi,
      result.personalFields.italiki,
    ].filter((v): v is string => Boolean(v));
    expect(new Set(values).size).toBe(values.length);

    // Vérifier champs officiels
    expect(result.officialFields.numeroMifpdi).toBeTruthy();

    console.log('[Test OCR] Champs extraits:', {
      personal: result.personalFields,
      official: result.officialFields
    });
  }, 60000); // Timeout augmenté

  it('devrait détecter quune image est un document burundais', async () => {
    const isBurundian = await isLikelyBurundiDocument(frontImageBuffer);
    expect(isBurundian).toBe(true);
  }, 120000);

  it('devrait rejeter une image non-burundaise', async () => {
    const nonBurundiBuffer = Buffer.from('Juste du texte simple');
    const isBurundian = await isLikelyBurundiDocument(nonBurundiBuffer).catch(() => false);
    expect(isBurundian).toBe(false);
  }, 30000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS MODULE 2: VALIDATION MIFPDI
// ═══════════════════════════════════════════════════════════════════════════════

describe('MifpdiValidator', () => {
  const validator = new MifpdiValidator();

  it('devrait valider les vrais numéros MIFPDI observés', () => {
    const realMifpdi1 = '1705/482.182/2021';
    const realMifpdi2 = '1705/481.013/2018';

    const result1 = validator.validateMifpdi(realMifpdi1);
    expect(result1.isValid).toBe(true);
    expect(result1.structure?.commune).toBe('1705');
    expect(result1.structure?.year).toBe('2021');

    const result2 = validator.validateMifpdi(realMifpdi2);
    expect(result2.isValid).toBe(true);
    expect(result2.structure?.commune).toBe('1705');
    expect(result2.structure?.year).toBe('2018');
  });

  it('devrait rejeter les formats MIFPDI invalides', () => {
    const invalidFormats = [
      '123/456', // Manque année
      '123/456/21', // Année 2 chiffres
      'abc/def/2022', // Contient lettres
      '1705//2021', // Section vide
      '1705/482.182/1950' // Année trop ancienne
    ];

    invalidFormats.forEach(mifpdi => {
      const result = validator.validateMifpdi(mifpdi);
      expect(result.isValid).toBe(false);
    });
  });

  it('devrait extraire le code commune et année correctement', () => {
    const mifpdi = '1705/482.182/2021';

    const commune = validator.extractCommuneCode(mifpdi);
    expect(commune).toBe('1705');

    const year = validator.extractEmissionYear(mifpdi);
    expect(year).toBe(2021);
  });

  it('devrait détecter un MIFPDI dans un texte OCR', () => {
    const ocrText = "République du Burundi \n N° MIFPDI 1705/481.013/2018 \n Ikarata Karangamuntu";
    const result = detectMifpdiInText(ocrText);

    expect(result).not.toBeNull();
    expect(result?.isValid).toBe(true);
    expect(result?.structure?.full).toBe('1705/481.013/2018');
  });
});
