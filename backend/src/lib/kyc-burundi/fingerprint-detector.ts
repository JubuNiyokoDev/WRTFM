/**
 * Module 6: Détection empreinte digitale (IGIKUMU CA NYENEYO)
 * Détecte la présence structurelle de l'empreinte digitale encrée bleue
 * PAS de matching biométrique (résolution photo insuffisante)
 */

import { Jimp } from 'jimp';

// Le typage de jimp v1 mélange ses déclarations ESM et CommonJS (dual package
// hazard) : les instances de Jimp.read ne sont pas assignables entre elles.
// On garde le bitmap typé et les méthodes en souplesse.
type JimpImage = { bitmap: { width: number; height: number; data: Buffer } } & Record<string, any>;
import {
  FingerprintDetection,
  BurundiKycError,
  KYC_ERROR_CODES
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DÉTECTION EMPREINTE
// ═══════════════════════════════════════════════════════════════════════════════

const FINGERPRINT_CONFIG = {
  // Couleur bleue de l'encre d'empreinte
  inkColor: {
    r: { min: 10, max: 100 },
    g: { min: 30, max: 130 },
    b: { min: 120, max: 255 }
  },
  // Taille minimale/maximale d'une empreinte en pixels
  minSize: 40,
  maxSize: 520,
  // Seuil de texture pour détecter motif de crêtes
  textureThreshold: 20,
  // Zone estimée de l'empreinte sur le livret réel: milieu-droit, sous "IGIKUMU CA NYENEYO".
  expectedRegion: {
    xRatio: 0.5,
    yRatio: 0.3,
    widthRatio: 0.35,
    heightRatio: 0.32
  }
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE DÉTECTION EMPREINTE
// ═══════════════════════════════════════════════════════════════════════════════

export class FingerprintDetector {

  /**
   * Détecte la présence de l'empreinte digitale (IGIKUMU CA NYENEYO)
   */
  async detectFingerprint(
    photoZoneBuffer: Buffer
  ): Promise<FingerprintDetection> {
    
    try {
      const img = await Jimp.fromBuffer(photoZoneBuffer);
      
      // Détecter région bleue correspondant à l'empreinte
      const blueRegion = await this.detectBlueInkRegion(img);
      
      if (!blueRegion) {
        return {
          detected: false,
          confidence: 0,
          isBlueInk: false,
          hasRidgePattern: false,
          quality: 'unreadable'
        };
      }
      
      // Vérifier texture de crêtes (pattern caractéristique)
      const hasRidges = await this.detectRidgePattern(img, blueRegion);
      
      // Calculer confiance basée sur détection et qualité
      const confidence = this.calculateConfidence(blueRegion, hasRidges);
      
      // Évaluer qualité
      const quality = this.assessQuality(confidence);
      
      return {
        detected: true,
        coordinates: blueRegion,
        confidence,
        isBlueInk: true,
        hasRidgePattern: hasRidges,
        quality
      };
      
    } catch (error) {
      console.warn('[FingerprintDetector] Erreur détection empreinte:', error);
      return {
        detected: false,
        confidence: 0,
        isBlueInk: false,
        hasRidgePattern: false,
        quality: 'unreadable'
      };
    }
  }

  /**
   * Détecte la région d'encre bleue (empreinte)
   */
  private async detectBlueInkRegion(
    img: JimpImage
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const data = img.bitmap.data;
    
    // Zone de recherche estimée (sous la photo)
    const searchX = Math.floor(width * FINGERPRINT_CONFIG.expectedRegion.xRatio);
    const searchY = Math.floor(height * FINGERPRINT_CONFIG.expectedRegion.yRatio);
    const searchW = Math.floor(width * FINGERPRINT_CONFIG.expectedRegion.widthRatio);
    const searchH = Math.floor(height * FINGERPRINT_CONFIG.expectedRegion.heightRatio);
    
    const maskWidth = Math.min(searchW, width - searchX);
    const maskHeight = Math.min(searchH, height - searchY);
    const mask = new Uint8Array(maskWidth * maskHeight);

    for (let y = searchY; y < searchY + searchH && y < height; y++) {
      for (let x = searchX; x < searchX + searchW && x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        if (this.isBlueInk(r, g, b)) {
          mask[(y - searchY) * maskWidth + (x - searchX)] = 1;
        }
      }
    }

    const component = this.findBestBlueComponent(mask, maskWidth, maskHeight);
    if (!component) {
      return null;
    }

    return {
      x: searchX + component.x,
      y: searchY + component.y,
      width: component.width,
      height: component.height,
    };
  }

  private findBestBlueComponent(
    mask: Uint8Array,
    width: number,
    height: number,
  ): { x: number; y: number; width: number; height: number; area: number } | null {
    const visited = new Uint8Array(mask.length);
    let best: { x: number; y: number; width: number; height: number; area: number; score: number } | null = null;

    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1],
    ];

    for (let startY = 0; startY < height; startY++) {
      for (let startX = 0; startX < width; startX++) {
        const startIndex = startY * width + startX;
        if (!mask[startIndex] || visited[startIndex]) continue;

        const stack = [startIndex];
        visited[startIndex] = 1;
        let minX = startX;
        let maxX = startX;
        let minY = startY;
        let maxY = startY;
        let area = 0;

        while (stack.length > 0) {
          const index = stack.pop()!;
          const x = index % width;
          const y = Math.floor(index / width);
          area++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);

          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(ni);
            }
          }
        }

        const componentWidth = maxX - minX + 1;
        const componentHeight = maxY - minY + 1;
        const aspect = componentHeight / Math.max(componentWidth, 1);
        const plausible =
          componentWidth >= FINGERPRINT_CONFIG.minSize &&
          componentHeight >= FINGERPRINT_CONFIG.minSize &&
          componentWidth <= FINGERPRINT_CONFIG.maxSize &&
          componentHeight <= FINGERPRINT_CONFIG.maxSize &&
          area >= 1500 &&
          aspect >= 1.1;

        if (!plausible) continue;

        const fillRatio = area / (componentWidth * componentHeight);
        const score = area * Math.min(fillRatio * 3, 1.5) * Math.min(aspect, 3);
        if (!best || score > best.score) {
          best = {
            x: minX,
            y: minY,
            width: componentWidth,
            height: componentHeight,
            area,
            score,
          };
        }
      }
    }

    return best;
  }

  /**
   * Vérifie si un pixel correspond à l'encre bleue de l'empreinte
   */
  private isBlueInk(r: number, g: number, b: number): boolean {
    const { inkColor } = FINGERPRINT_CONFIG;
    return (
      r >= inkColor.r.min && r <= 115 &&
      g >= inkColor.g.min && g <= 145 &&
      b >= inkColor.b.min && b <= inkColor.b.max &&
      b > r + 25 && b > g + 10
    );
  }

  /**
   * Détecte le pattern de crêtes caractéristique d'une empreinte
   * Analyse la texture pour trouver lignes concentriques
   */
  private async detectRidgePattern(
    img: JimpImage,
    region: { x: number; y: number; width: number; height: number }
  ): Promise<boolean> {
    
    const data = img.bitmap.data;
    const imgWidth = img.bitmap.width;
    
    // Extraire la région de l'empreinte
    let textureVariance = 0;
    let sampleCount = 0;
    
    // Échantillonner la texture dans la région
    for (let y = region.y; y < region.y + region.height; y += 2) {
      for (let x = region.x; x < region.x + region.width; x += 2) {
        const gradient = this.calculateLocalGradient(data, imgWidth, x, y);
        textureVariance += gradient;
        sampleCount++;
      }
    }
    
    const avgVariance = sampleCount > 0 ? textureVariance / sampleCount : 0;
    
    // Empreinte a texture caractéristique (variance moyenne à haute)
    return avgVariance > FINGERPRINT_CONFIG.textureThreshold;
  }

  /**
   * Calcule le gradient local pour analyse de texture
   */
  private calculateLocalGradient(
    data: Buffer,
    imgWidth: number,
    x: number,
    y: number
  ): number {
    
    const centerIdx = (y * imgWidth + x) * 4;
    const centerIntensity = data[centerIdx + 2]; // Canal bleu
    
    // Voisins 4-connectés
    const neighbors = [
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 }
    ];
    
    let gradient = 0;
    
    for (const { dx, dy } of neighbors) {
      const nIdx = ((y + dy) * imgWidth + (x + dx)) * 4;
      const nIntensity = data[nIdx + 2];
      gradient += Math.abs(centerIntensity - nIntensity);
    }
    
    return gradient / neighbors.length;
  }

  /**
   * Calcule la confiance de détection
   */
  private calculateConfidence(
    region: { width: number; height: number },
    hasRidges: boolean
  ): number {
    
    let confidence = 50; // Base
    
    // Bonus si taille plausible
    const area = region.width * region.height;
    if (area >= 3000 && area <= 15000) {
      confidence += 20;
    }
    
    // Bonus si pattern de crêtes détecté
    if (hasRidges) {
      confidence += 30;
    }
    
    return Math.min(confidence, 100);
  }

  /**
   * Évalue la qualité de l'empreinte détectée
   */
  private assessQuality(confidence: number): 'good' | 'poor' | 'unreadable' {
    if (confidence >= 80) return 'good';
    if (confidence >= 50) return 'poor';
    return 'unreadable';
  }

  /**
   * Vérifie si l'empreinte est dans la zone attendue
   * (sous la photo, zone IGIKUMU CA NYENEYO)
   */
  isInExpectedLocation(
    detection: FingerprintDetection,
    imageWidth: number,
    imageHeight: number
  ): boolean {
    
    if (!detection.detected || !detection.coordinates) {
      return false;
    }
    
    const { x, y } = detection.coordinates;
    const expectedX = imageWidth * FINGERPRINT_CONFIG.expectedRegion.xRatio;
    const expectedY = imageHeight * FINGERPRINT_CONFIG.expectedRegion.yRatio;
    
    // Tolérance de ±15% de la position attendue
    const toleranceX = imageWidth * 0.15;
    const toleranceY = imageHeight * 0.15;
    
    return (
      Math.abs(x - expectedX) < toleranceX &&
      Math.abs(y - expectedY) < toleranceY
    );
  }
}

/**
 * Instance globale du détecteur d'empreinte
 */
export const fingerprintDetector = new FingerprintDetector();

/**
 * Fonction utilitaire pour détection rapide
 */
export async function detectFingerprint(
  photoZoneBuffer: Buffer
): Promise<FingerprintDetection> {
  return fingerprintDetector.detectFingerprint(photoZoneBuffer);
}
