/**
 * Tests de la correction lexicale post-OCR.
 * Paires vérité terrain fournies par le titulaire du document de test.
 */

import { describe, it, expect } from 'vitest';
import { normalizeExtractedFields } from '../field-normalizer';
import { BurundiPersonalFields, BurundiOfficialFields } from '../types';

function run(personal: Partial<BurundiPersonalFields>, official: Partial<BurundiOfficialFields> = {}) {
  const p = personal as BurundiPersonalFields;
  const o = official as BurundiOfficialFields;
  const corrections = normalizeExtractedFields(p, o);
  return { p, o, corrections };
}

describe('normalizeExtractedFields', () => {
  it('corrige les misreads OCR réels vers le lexique', () => {
    const { p, o } = run(
      { provensi: 'RUTIGI', arubatse: 'OIL', akaziAkora: 'ELEYX' },
      { uwuyitanze: 'MUSITANTERN' },
    );
    expect(p.provensi).toBe('RUYIGI');
    expect(p.arubatse).toBe('OYA');
    expect(p.akaziAkora).toBe('ELEVE');
    expect(o.uwuyitanze).toBe('MUSITANTERI');
  });

  it('ne touche jamais aux noms propres ni au lieu de naissance', () => {
    const { p } = run({
      izina: 'NITONDIKO', // vrai nom: NIYONDIKO — vocabulaire ouvert, pas de correction
      amatazirano: 'JOFPRE',
      yavukiye: 'KUVONO', // vraie colline: MUVUMU — vocabulaire ouvert
    });
    expect(p.izina).toBe('NITONDIKO');
    expect(p.amatazirano).toBe('JOFPRE');
    expect(p.yavukiye).toBe('KUVONO');
  });

  it('laisse intactes les valeurs déjà correctes', () => {
    const { p, corrections } = run({ provensi: 'GITEGA', arubatse: 'OYA', akaziAkora: 'ELEVE' });
    expect(p.provensi).toBe('GITEGA');
    expect(p.arubatse).toBe('OYA');
    expect(p.akaziAkora).toBe('ELEVE');
    expect(corrections).toHaveLength(0);
  });

  it('ne corrige pas arubatse quand la valeur est un nom (conjoint)', () => {
    const { p } = run({ arubatse: 'NDAYIZEYE' });
    expect(p.arubatse).toBe('NDAYIZEYE');
  });

  it('ne corrige pas une valeur trop éloignée de tout le lexique', () => {
    const { p } = run({ provensi: 'XXXXXX' });
    expect(p.provensi).toBe('XXXXXX');
  });

  it('rapporte les corrections appliquées avec la distance', () => {
    const { corrections } = run({ provensi: 'RUTIGI' });
    expect(corrections).toEqual([
      { field: 'provensi', raw: 'RUTIGI', corrected: 'RUYIGI', distance: 1 },
    ]);
  });
});
