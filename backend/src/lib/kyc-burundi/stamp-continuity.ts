/**
 * Module 5: Continuité du tampon à la jonction photo/document
 * Vérifie que le tampon chevauche correctement la bordure photo/carte
 * Une photo remplacée casserait cette continuité (anti-fraude)
 */

import { Jimp } from 'jimp';

// Le typage de jimp v1 mélange ses déclarations ESM et CommonJS (dual package
// hazard) : les instances de Jimp.read ne sont pas assignables entre elles.
// On garde le bitmap typé et les méthodes en souplesse.
type JimpImage = { bitmap: { width: number; height: number; data: Buffer } } & Record<string, any>;
import {
  StampContinuityResult,
  BurundiKycError,
  KYC_ERROR_CODES
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION DÉTECTION CONTINUITÉ
// ═══════════════════════════════════════════════════════════════════════════════

const CONTINUITY_CONFIG = {
  // Seuil de gradient de couleur pour détecter une bordure
  edgeThreshold: 30,
  // Nombre minimum de points de correspondance pour valider continuité
  minMatchPoints: 5,
  // Tolérance de couleur pour matching (différence RGB)
  colorTolerance: 40,
  // Largeur de la bande d'analyse autour de la bordure (pixels)
  analysisWidth: 20
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE DÉTECTION CONTINUITÉ
// ═══════════════════════════════════════════════════════════════════════════════

export class StampContinuityDetector {

  /**
   * Vérifie la continuité du tampon à la jonction photo/document
   */
  async checkContinuity(
    photoZoneBuffer: Buffer,
    expectedPhotoRegion?: { x: number; y: number; width: number; height: number }
  ): Promise<StampContinuityResult> {
    
    try {
      const img = await Jimp.fromBuffer(photoZoneBuffer);
      
      // Détecter la bordure de la photo (rectangle de la photo sur le document)
      const photoBorder = expectedPhotoRegion || 
        await this.detectPhotoBorder(img);
      
      if (!photoBorder) {
        return {
          hasContinuity: false,
          confidence: 0,
          edgeMatches: 0,
          method: 'edge_detection'
        };
      }
      
      // Analyser la continuité du tampon à travers la bordure
      const edgeMatches = await this.analyzeEdgeContinuity(img, photoBorder);
      
      // Calculer confiance basée sur nombre de correspondances
      const confidence = Math.min(
        (edgeMatches / CONTINUITY_CONFIG.minMatchPoints) * 100,
        100
      );
      
      return {
        hasContinuity: edgeMatches >= CONTINUITY_CONFIG.minMatchPoints,
        confidence,
        edgeMatches,
        method: 'edge_detection'
      };
      
    } catch (error) {
      console.warn('[StampContinuity] Erreur analyse continuité:', error);
      return {
        hasContinuity: false,
        confidence: 0,
        edgeMatches: 0,
        method: 'edge_detection'
      };
    }
  }

  /**
   * Détecte la bordure de la photo dans l'image
   * La photo est typiquement un rectangle dans le tiers droit
   */
  private async detectPhotoBorder(
    img: JimpImage
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    
    // Livret burundais réel: photo dans la zone centrale basse du volet droit.
    // Ancienne heuristique "tiers droit haut" venait d'un format carte plastique.
    const estimatedX = Math.floor(width * 0.24);
    const estimatedY = Math.floor(height * 0.42);
    const estimatedWidth = Math.floor(width * 0.27);
    const estimatedHeight = Math.floor(height * 0.18);
    
    return {
      x: estimatedX,
      y: estimatedY,
      width: estimatedWidth,
      height: estimatedHeight
    };
  }

  /**
   * Analyse la continuité du tampon le long de la bordure de la photo
   */
  private async analyzeEdgeContinuity(
    img: JimpImage,
    photoBorder: { x: number; y: number; width: number; height: number }
  ): Promise<number> {
    const sides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
    let matchPoints = 0;

    for (const side of sides) {
      const continuity = this.measureBandContinuity(img, photoBorder, side);
      if (continuity.insideBlueRatio >= 0.012 && continuity.outsideBlueRatio >= 0.012) {
        matchPoints += 3;
      } else if (continuity.insideBlueRatio >= 0.006 && continuity.outsideBlueRatio >= 0.006) {
        matchPoints += 1;
      }
    }

    return matchPoints;
  }

  private measureBandContinuity(
    img: JimpImage,
    border: { x: number; y: number; width: number; height: number },
    side: 'top' | 'right' | 'bottom' | 'left'
  ): { insideBlueRatio: number; outsideBlueRatio: number } {
    const band = 35;
    const inside =
      side === 'left' ? { x: border.x, y: border.y, width: band, height: border.height } :
      side === 'right' ? { x: border.x + border.width - band, y: border.y, width: band, height: border.height } :
      side === 'top' ? { x: border.x, y: border.y, width: border.width, height: band } :
      { x: border.x, y: border.y + border.height - band, width: border.width, height: band };

    const outside =
      side === 'left' ? { x: border.x - band, y: border.y, width: band, height: border.height } :
      side === 'right' ? { x: border.x + border.width, y: border.y, width: band, height: border.height } :
      side === 'top' ? { x: border.x, y: border.y - band, width: border.width, height: band } :
      { x: border.x, y: border.y + border.height, width: border.width, height: band };

    return {
      insideBlueRatio: this.blueRatioInRect(img, inside),
      outsideBlueRatio: this.blueRatioInRect(img, outside),
    };
  }

  private blueRatioInRect(
    img: JimpImage,
    rect: { x: number; y: number; width: number; height: number }
  ): number {
    const data = img.bitmap.data;
    const imgWidth = img.bitmap.width;
    const imgHeight = img.bitmap.height;
    const startX = Math.max(0, Math.floor(rect.x));
    const startY = Math.max(0, Math.floor(rect.y));
    const endX = Math.min(imgWidth, Math.floor(rect.x + rect.width));
    const endY = Math.min(imgHeight, Math.floor(rect.y + rect.height));
    let blue = 0;
    let total = 0;

    for (let y = startY; y < endY; y += 2) {
      for (let x = startX; x < endX; x += 2) {
        total++;
        const idx = (y * imgWidth + x) * 4;
        if (this.isBlueStamp(data[idx], data[idx + 1], data[idx + 2])) {
          blue++;
        }
      }
    }

    return total > 0 ? blue / total : 0;
  }

  /**
   * Génère des points d'échantillonnage le long d'un côté de la bordure
   */
  private generateBorderPoints(
    border: { x: number; y: number; width: number; height: number },
    side: 'top' | 'right' | 'bottom' | 'left'
  ): Array<{ x: number; y: number }> {
    
    const points: Array<{ x: number; y: number }> = [];
    const sampleCount = 10; // Points à échantillonner par côté
    
    switch (side) {
      case 'top':
        for (let i = 0; i < sampleCount; i++) {
          points.push({
            x: border.x + Math.floor((border.width / sampleCount) * i),
            y: border.y
          });
        }
        break;
      
      case 'right':
        for (let i = 0; i < sampleCount; i++) {
          points.push({
            x: border.x + border.width,
            y: border.y + Math.floor((border.height / sampleCount) * i)
          });
        }
        break;
      
      case 'bottom':
        for (let i = 0; i < sampleCount; i++) {
          points.push({
            x: border.x + Math.floor((border.width / sampleCount) * i),
            y: border.y + border.height
          });
        }
        break;
      
      case 'left':
        for (let i = 0; i < sampleCount; i++) {
          points.push({
            x: border.x,
            y: border.y + Math.floor((border.height / sampleCount) * i)
          });
        }
        break;
    }
    
    return points;
  }

  /**
   * Vérifie la continuité du tampon à un point spécifique de la bordure
   * Compare couleurs de part et d'autre de la bordure
   */
  private checkPointContinuity(
    data: Buffer,
    imgWidth: number,
    imgHeight: number,
    point: { x: number; y: number },
    side: 'top' | 'right' | 'bottom' | 'left'
  ): boolean {
    const offset = CONTINUITY_CONFIG.analysisWidth;
    const radius = 12;

    const inside =
      side === 'left' ? { x: point.x + offset, y: point.y } :
      side === 'right' ? { x: point.x - offset, y: point.y } :
      side === 'top' ? { x: point.x, y: point.y + offset } :
      { x: point.x, y: point.y - offset };

    const outside =
      side === 'left' ? { x: point.x - offset, y: point.y } :
      side === 'right' ? { x: point.x + offset, y: point.y } :
      side === 'top' ? { x: point.x, y: point.y - offset } :
      { x: point.x, y: point.y + offset };

    return (
      this.hasBlueStampNearby(data, imgWidth, imgHeight, inside, radius) &&
      this.hasBlueStampNearby(data, imgWidth, imgHeight, outside, radius)
    );
  }

  private hasBlueStampNearby(
    data: Buffer,
    imgWidth: number,
    imgHeight: number,
    point: { x: number; y: number },
    radius: number
  ): boolean {
    let bluePixels = 0;
    let sampled = 0;

    for (let y = point.y - radius; y <= point.y + radius; y += 2) {
      for (let x = point.x - radius; x <= point.x + radius; x += 2) {
        if (x < 0 || y < 0 || x >= imgWidth || y >= imgHeight) continue;
        sampled++;
        const idx = (y * imgWidth + x) * 4;
        if (this.isBlueStamp(data[idx], data[idx + 1], data[idx + 2])) {
          bluePixels++;
        }
      }
    }

    return sampled > 0 && bluePixels / sampled >= 0.08;
  }

  /**
   * Vérifie si une couleur correspond au bleu du tampon
   */
  private isBlueStamp(r: number, g: number, b: number): boolean {
    return (
      b > 135 &&
      r < 145 &&
      g < 170 &&
      b > r + 20 &&
      b > g + 5
    );
  }

  /**
   * Analyse alternative par gradient de couleur
   * Détecte les transitions brutales qui indiqueraient une photo remplacée
   */
  async checkByColorGradient(
    photoZoneBuffer: Buffer,
    photoBorder: { x: number; y: number; width: number; height: number }
  ): Promise<{ hasSmoothTransition: boolean; gradientScore: number }> {
    
    const img = await Jimp.fromBuffer(photoZoneBuffer);
    const data = img.bitmap.data;
    const imgWidth = img.bitmap.width;
    
    let smoothPoints = 0;
    let totalPoints = 0;
    
    // Échantillonner le long de la bordure
    const borderPoints = [
      ...this.generateBorderPoints(photoBorder, 'top'),
      ...this.generateBorderPoints(photoBorder, 'right')
    ];
    
    for (const point of borderPoints) {
      const gradient = this.calculateLocalGradient(data, imgWidth, point);
      totalPoints++;
      
      // Gradient faible = transition douce = continuité naturelle
      if (gradient < CONTINUITY_CONFIG.edgeThreshold) {
        smoothPoints++;
      }
    }
    
    const gradientScore = totalPoints > 0 ? smoothPoints / totalPoints : 0;
    
    return {
      hasSmoothTransition: gradientScore > 0.6,
      gradientScore
    };
  }

  /**
   * Calcule le gradient local de couleur autour d'un point
   */
  private calculateLocalGradient(
    data: Buffer,
    imgWidth: number,
    point: { x: number; y: number }
  ): number {
    
    const { x, y } = point;
    
    // Couleur centrale
    const centerIdx = (y * imgWidth + x) * 4;
    const centerR = data[centerIdx];
    const centerG = data[centerIdx + 1];
    const centerB = data[centerIdx + 2];
    
    // Couleurs voisines (4-connectivité)
    const neighbors = [
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 }
    ];
    
    let totalGradient = 0;
    
    for (const { dx, dy } of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const nIdx = (ny * imgWidth + nx) * 4;
      
      const diffR = Math.abs(centerR - data[nIdx]);
      const diffG = Math.abs(centerG - data[nIdx + 1]);
      const diffB = Math.abs(centerB - data[nIdx + 2]);
      
      totalGradient += diffR + diffG + diffB;
    }
    
    return totalGradient / neighbors.length;
  }
}

/**
 * Instance globale du détecteur de continuité
 */
export const continuityDetector = new StampContinuityDetector();

/**
 * Fonction utilitaire pour vérification rapide
 */
export async function checkStampContinuity(
  photoZoneBuffer: Buffer,
  expectedPhotoRegion?: { x: number; y: number; width: number; height: number }
): Promise<StampContinuityResult> {
  return continuityDetector.checkContinuity(photoZoneBuffer, expectedPhotoRegion);
}
