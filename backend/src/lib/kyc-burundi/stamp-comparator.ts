/**
 * Module 4: Comparaison visuelle des deux tampons
 * Compare le tampon de zone photo (zone b) vs tampon page émission (zone d)
 * Ils doivent être visuellement identiques (même commune, même design)
 */

import { Jimp } from 'jimp';

// Le typage de jimp v1 mélange ses déclarations ESM et CommonJS (dual package
// hazard) : les instances de Jimp.read ne sont pas assignables entre elles.
// On garde le bitmap typé et les méthodes en souplesse.
type JimpImage = { bitmap: { width: number; height: number; data: Buffer } } & Record<string, any>;
import {
  StampDetection,
  StampComparisonResult,
  BurundiKycError,
  KYC_ERROR_CODES
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DÉTECTION TAMPONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration pour la détection de tampons ronds bleus burundais
 */
const STAMP_DETECTION_CONFIG = {
  // Couleur bleue typique des tampons officiels burundais
  targetColor: {
    r: { min: 20, max: 120 },
    g: { min: 50, max: 150 },
    b: { min: 150, max: 255 }
  },
  // Taille minimale/maximale d'un tampon en pixels
  minSize: 80,
  maxSize: 400,
  // Ratio circulaire (width/height proche de 1.0)
  circularityTolerance: 0.3,
  // Seuil de similarité pour considérer deux tampons identiques
  similarityThreshold: 0.75
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE COMPARAISON TAMPONS
// ═══════════════════════════════════════════════════════════════════════════════

export class StampComparator {

  /**
   * Compare deux tampons (zone photo vs zone émission)
   */
  async compareStamps(
    photoZoneBuffer: Buffer,
    officialZoneBuffer: Buffer
  ): Promise<StampComparisonResult> {
    
    // Détecter les tampons dans les deux zones
    const photoStamp = await this.detectStamp(photoZoneBuffer, 'photo');
    const officialStamp = await this.detectStamp(officialZoneBuffer, 'official');
    
    if (!photoStamp.detected || !officialStamp.detected) {
      return {
        areIdentical: false,
        similarity: 0,
        photoStamp,
        officialStamp,
        method: 'combined'
      };
    }
    
    // Comparer les tampons détectés
    const similarity = await this.calculateStampSimilarity(
      photoZoneBuffer,
      photoStamp,
      officialZoneBuffer,
      officialStamp
    );
    
    return {
      areIdentical: similarity >= STAMP_DETECTION_CONFIG.similarityThreshold,
      similarity,
      photoStamp,
      officialStamp,
      method: 'combined'
    };
  }

  /**
   * Détecte un tampon rond bleu dans une zone d'image
   */
  async detectStamp(
    imageBuffer: Buffer,
    zone: 'photo' | 'official'
  ): Promise<StampDetection> {
    
    try {
      const img = await Jimp.fromBuffer(imageBuffer);
      
      // Détecter zone bleue (tampon)
      const blueRegion = await this.detectBlueRegion(img);
      
      if (!blueRegion) {
        return {
          detected: false,
          coordinates: { x: 0, y: 0, width: 0, height: 0 },
          confidence: 0,
          color: 'unknown',
          overlapsPhoto: false
        };
      }
      
      // Vérifier circularité (tampon rond)
      const isCircular = this.checkCircularity(blueRegion);
      
      // Détecter si le tampon chevauche la photo (critère anti-fraude)
      const overlapsPhoto = zone === 'photo' ? 
        this.detectPhotoOverlap(img, blueRegion) : false;
      
      return {
        detected: true,
        coordinates: blueRegion,
        confidence: isCircular ? 85 : 60,
        color: 'blue',
        overlapsPhoto,
        text: undefined // OCR fait séparément dans triangle-coherence
      };
      
    } catch (error) {
      console.warn('[StampComparator] Erreur détection tampon:', error);
      return {
        detected: false,
        coordinates: { x: 0, y: 0, width: 0, height: 0 },
        confidence: 0,
        color: 'unknown',
        overlapsPhoto: false
      };
    }
  }

  /**
   * Détecte la région bleue (tampon) dans l'image
   */
  private async detectBlueRegion(
    img: JimpImage
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const data = img.bitmap.data;
    
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let bluePixelCount = 0;
    
    // Scanner l'image pour trouver pixels bleus
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Vérifier si pixel correspond à la couleur bleue du tampon
        if (this.isStampBlue(r, g, b)) {
          bluePixelCount++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    const regionWidth = maxX - minX;
    const regionHeight = maxY - minY;
    
    // Vérifier taille minimale
    if (regionWidth < STAMP_DETECTION_CONFIG.minSize || 
        regionHeight < STAMP_DETECTION_CONFIG.minSize) {
      return null;
    }
    
    return {
      x: minX,
      y: minY,
      width: regionWidth,
      height: regionHeight
    };
  }

  /**
   * Vérifie si un pixel correspond à la couleur bleue du tampon
   */
  private isStampBlue(r: number, g: number, b: number): boolean {
    const { targetColor } = STAMP_DETECTION_CONFIG;
    return (
      r >= targetColor.r.min && r <= targetColor.r.max &&
      g >= targetColor.g.min && g <= targetColor.g.max &&
      b >= targetColor.b.min && b <= targetColor.b.max &&
      b > r && b > g // Le bleu doit dominer
    );
  }

  /**
   * Vérifie la circularité d'une région (tampon rond)
   */
  private checkCircularity(
    region: { x: number; y: number; width: number; height: number }
  ): boolean {
    const ratio = region.width / region.height;
    return Math.abs(ratio - 1.0) <= STAMP_DETECTION_CONFIG.circularityTolerance;
  }

  /**
   * Détecte si le tampon chevauche la photo (zone critique anti-fraude)
   */
  private detectPhotoOverlap(
    img: JimpImage,
    stampRegion: { x: number; y: number; width: number; height: number }
  ): boolean {
    // Heuristique: si le tampon est dans le tiers droit de l'image (zone photo typique)
    const rightThirdStart = (img.bitmap.width * 2) / 3;
    return stampRegion.x >= rightThirdStart;
  }

  /**
   * Calcule la similarité entre deux tampons
   * Combine histogramme de couleur + comparaison structurelle
   */
  private async calculateStampSimilarity(
    img1Buffer: Buffer,
    stamp1: StampDetection,
    img2Buffer: Buffer,
    stamp2: StampDetection
  ): Promise<number> {
    
    // Extraire les régions des tampons
    const stamp1Crop = await this.cropStampRegion(img1Buffer, stamp1.coordinates);
    const stamp2Crop = await this.cropStampRegion(img2Buffer, stamp2.coordinates);
    
    // Méthode 1: Histogramme de couleur
    const colorSimilarity = await this.compareColorHistograms(stamp1Crop, stamp2Crop);
    
    // Méthode 2: Comparaison structurelle (forme)
    const shapeSimilarity = this.compareShapes(stamp1.coordinates, stamp2.coordinates);
    
    // Combinaison pondérée
    return (colorSimilarity * 0.7) + (shapeSimilarity * 0.3);
  }

  /**
   * Extrait la région du tampon de l'image
   */
  private async cropStampRegion(
    imageBuffer: Buffer,
    coords: { x: number; y: number; width: number; height: number }
  ): Promise<JimpImage> {
    const img = await Jimp.fromBuffer(imageBuffer);
    return img.crop({
      x: coords.x,
      y: coords.y,
      w: coords.width,
      h: coords.height
    });
  }

  /**
   * Compare les histogrammes de couleur de deux tampons
   */
  private async compareColorHistograms(stamp1: JimpImage, stamp2: JimpImage): Promise<number> {
    // Redimensionner à la même taille pour comparaison
    const size = 64;
    stamp1.resize({ w: size, h: size });
    stamp2.resize({ w: size, h: size });
    
    // Calculer histogrammes
    const hist1 = this.calculateColorHistogram(stamp1);
    const hist2 = this.calculateColorHistogram(stamp2);
    
    // Coefficient de Bhattacharyya
    return this.bhattacharyyaCoefficient(hist1, hist2);
  }

  /**
   * Calcule l'histogramme de couleur d'une image
   */
  private calculateColorHistogram(img: JimpImage): number[] {
    const hist = new Array(256).fill(0);
    const data = img.bitmap.data;
    const total = img.bitmap.width * img.bitmap.height;
    
    for (let i = 0; i < data.length; i += 4) {
      const b = data[i + 2]; // Canal bleu (dominant pour tampons)
      hist[b]++;
    }
    
    // Normaliser
    return hist.map(v => v / total);
  }

  /**
   * Calcule le coefficient de Bhattacharyya entre deux histogrammes
   */
  private bhattacharyyaCoefficient(hist1: number[], hist2: number[]): number {
    let bc = 0;
    for (let i = 0; i < hist1.length; i++) {
      bc += Math.sqrt(hist1[i] * hist2[i]);
    }
    return Math.min(bc, 1);
  }

  /**
   * Compare les formes (dimensions) de deux tampons
   */
  private compareShapes(
    coords1: { width: number; height: number },
    coords2: { width: number; height: number }
  ): number {
    const sizeDiff = Math.abs(coords1.width - coords2.width) + 
                     Math.abs(coords1.height - coords2.height);
    const avgSize = (coords1.width + coords1.height + coords2.width + coords2.height) / 4;
    
    return Math.max(0, 1 - (sizeDiff / avgSize));
  }
}

/**
 * Instance globale du comparateur de tampons
 */
export const stampComparator = new StampComparator();

/**
 * Fonction utilitaire pour comparaison rapide
 */
export async function compareStamps(
  photoZoneBuffer: Buffer,
  officialZoneBuffer: Buffer
): Promise<StampComparisonResult> {
  return stampComparator.compareStamps(photoZoneBuffer, officialZoneBuffer);
}