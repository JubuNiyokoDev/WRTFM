import { describe, it, expect } from "vitest";
import { Jimp, JimpMime } from "jimp";
import {
  compareFaces,
  runKycVerification,
} from "../lib/kyc-engine";

// Helper to create synthetic images with Jimp
async function createSyntheticImage(
  width: number,
  height: number,
  colorOrPattern: "red" | "blue" | "gradient" | "solid-black" | "id-card-like" | "noisy-face"
): Promise<string> {
  const img = new Jimp({ width, height, color: 0x000000ff });

  if (colorOrPattern === "red") {
    img.scan(0, 0, width, height, (x, y, idx) => {
      // Add noise to avoid uniform detection
      const noise = Math.floor(Math.random() * 40) - 20;
      img.bitmap.data[idx + 0] = Math.max(0, Math.min(255, 200 + noise)); // R
      img.bitmap.data[idx + 1] = Math.max(0, Math.min(255, 30 + noise));  // G
      img.bitmap.data[idx + 2] = Math.max(0, Math.min(255, 30 + noise));  // B
      img.bitmap.data[idx + 3] = 255; // A
    });
  } else if (colorOrPattern === "blue") {
    img.scan(0, 0, width, height, (x, y, idx) => {
      const noise = Math.floor(Math.random() * 40) - 20;
      img.bitmap.data[idx + 0] = Math.max(0, Math.min(255, 30 + noise));  // R
      img.bitmap.data[idx + 1] = Math.max(0, Math.min(255, 30 + noise));  // G
      img.bitmap.data[idx + 2] = Math.max(0, Math.min(255, 200 + noise)); // B
      img.bitmap.data[idx + 3] = 255; // A
    });
  } else if (colorOrPattern === "gradient") {
    img.scan(0, 0, width, height, (x, y, idx) => {
      const intensity = Math.floor((x / width) * 255);
      const noise = Math.floor(Math.random() * 30) - 15;
      const val = Math.max(0, Math.min(255, intensity + noise));
      img.bitmap.data[idx + 0] = val;
      img.bitmap.data[idx + 1] = val;
      img.bitmap.data[idx + 2] = val;
      img.bitmap.data[idx + 3] = 255;
    });
  } else if (colorOrPattern === "solid-black") {
    // Already black by default, keep it (for testing rejection)
  } else if (colorOrPattern === "noisy-face") {
    // Create a face-like pattern with sufficient variation
    img.scan(0, 0, width, height, (x, y, idx) => {
      // Create an oval face shape with skin tone
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = (x - centerX) / (width / 2);
      const dy = (y - centerY) / (height / 2);
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);
      
      // Skin tone base (peach/tan)
      let r = 220, g = 180, b = 150;
      
      // Add features and variation
      if (distFromCenter < 0.8) {
        // Inside face oval
        // Add random texture/noise (pores, shadows)
        const noise = Math.floor(Math.random() * 50) - 25;
        // Add gradient from top (forehead lighter) to bottom (chin darker)
        const verticalShade = (y / height - 0.5) * 40;
        
        r = Math.max(0, Math.min(255, r + noise + verticalShade));
        g = Math.max(0, Math.min(255, g + noise + verticalShade));
        b = Math.max(0, Math.min(255, b + noise + verticalShade));
        
        // Add eye regions (darker)
        if (y > height * 0.35 && y < height * 0.45 && Math.abs(x - centerX) > width * 0.15 && Math.abs(x - centerX) < width * 0.3) {
          r -= 60; g -= 60; b -= 40;
        }
        
        // Add mouth region (darker/reddish)
        if (y > height * 0.65 && y < height * 0.75 && Math.abs(x - centerX) < width * 0.2) {
          r += 20; g -= 30; b -= 30;
        }
      } else {
        // Background (darker)
        const bgNoise = Math.floor(Math.random() * 30);
        r = 80 + bgNoise;
        g = 80 + bgNoise;
        b = 80 + bgNoise;
      }
      
      img.bitmap.data[idx + 0] = Math.max(0, Math.min(255, r));
      img.bitmap.data[idx + 1] = Math.max(0, Math.min(255, g));
      img.bitmap.data[idx + 2] = Math.max(0, Math.min(255, b));
      img.bitmap.data[idx + 3] = 255;
    });
  } else if (colorOrPattern === "id-card-like") {
    // Create an image that looks like an ID card with sufficient noise
    img.scan(0, 0, width, height, (x, y, idx) => {
      const leftZone = x < width * 0.65;
      const noise = Math.floor(Math.random() * 25) - 12;
      
      if (leftZone) {
        // White background with text-like patterns
        const hasText = y > height * 0.2 && y < height * 0.8 && x > width * 0.1 && x < width * 0.5 && (Math.floor(y / 20) % 2 === 0);
        const val = hasText ? 100 : 220;
        const finalVal = Math.max(0, Math.min(255, val + noise));
        img.bitmap.data[idx + 0] = finalVal;
        img.bitmap.data[idx + 1] = finalVal;
        img.bitmap.data[idx + 2] = finalVal;
        img.bitmap.data[idx + 3] = 255;
      } else {
        // Portrait zone - use face-like variation with high contrast features
        const relY = (y / height);
        const relX = (x - width * 0.65) / (width * 0.35);
        
        // Add strong features to ensure stdDev > 15
        // Create eye-like dark regions
        const hasEyes = relY > 0.3 && relY < 0.45 && (relX < 0.3 || relX > 0.7);
        // Create mouth-like dark region
        const hasMouth = relY > 0.65 && relY < 0.75 && relX > 0.3 && relX < 0.7;
        
        // Skin tone base in portrait area with strong gradient
        let base = 100 + Math.floor(relY * 100); // Wider range
        
        if (hasEyes) {
          base = 30; // Very dark eyes
        } else if (hasMouth) {
          base = 60; // Dark mouth
        }
        
        // Add strong noise for texture
        const strongNoise = Math.floor(Math.random() * 50) - 25;
        const r = Math.max(0, Math.min(255, base + 40 + strongNoise));
        const g = Math.max(0, Math.min(255, base + 20 + strongNoise));
        const b = Math.max(0, Math.min(255, base + strongNoise));
        
        img.bitmap.data[idx + 0] = r;
        img.bitmap.data[idx + 1] = g;
        img.bitmap.data[idx + 2] = b;
        img.bitmap.data[idx + 3] = 255;
      }
    });
  }

  const buffer = await img.getBuffer(JimpMime.jpeg);
  const base64 = buffer.toString("base64");
  return `data:image/jpeg;base64,${base64}`;
}

describe("kyc-engine", () => {
  describe("analyzeDocument (via runKycVerification)", () => {
    it("should accept an image with ID card aspect ratio", async () => {
      // ID cards are typically 1.58 aspect ratio (85.6mm x 53.98mm)
      const idCardImage = await createSyntheticImage(500, 316, "id-card-like"); // ~1.58 ratio
      const selfieImage = await createSyntheticImage(200, 200, "noisy-face");

      const result = await runKycVerification(idCardImage, selfieImage, "Test User");
      
      // Should pass the document check
      expect(result.document.isLikelyIdCard).toBe(true);
      expect(result.document.aspectRatio).toBeGreaterThan(1.2);
      expect(result.document.aspectRatio).toBeLessThan(2.2);
    });

    it("should reject a square or too small image", async () => {
      // Square image (1:1 ratio) should fail
      const squareImage = await createSyntheticImage(200, 200, "gradient");
      const selfieImage = await createSyntheticImage(200, 200, "noisy-face");

      const result = await runKycVerification(squareImage, selfieImage, "Test User");
      
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("ne ressemble pas à une carte d'identité");
      expect(result.document.isLikelyIdCard).toBe(false);
    });
  });

  describe("compareFaces", () => {
    it("should give reasonable similarity when comparing ID portrait zone with itself as selfie", async () => {
      // compareFaces() crops the portrait zone from the first image and compares with second
      // Even with the same image, cropped zone vs full image won't be identical
      const idCard = await createSyntheticImage(500, 316, "id-card-like");

      const result = await compareFaces(idCard, idCard);
      
      expect(result.detected).toBe(true);
      // Since we crop portrait zone from first image and compare with full second image,
      // similarity will be good but not perfect (portrait zone has more uniform skin tone)
      expect(result.similarity).toBeGreaterThan(0.4);
      expect(result.similarity).toBeLessThan(0.9);
      expect(result.method).toBe("bhattacharyya_multi_histogram_v3");
    });

    it("should give lower similarity for very different face patterns", async () => {
      // Compare ID card portrait zone with a noisy face pattern
      const idCard = await createSyntheticImage(500, 316, "id-card-like");
      const differentFace = await createSyntheticImage(200, 200, "noisy-face");

      const result = await compareFaces(idCard, differentFace);
      
      expect(result.detected).toBe(true);
      // Different synthetic faces should have measurably different histograms
      // but both have face-like features so similarity won't be zero
      expect(result.similarity).toBeGreaterThan(0);
      expect(result.similarity).toBeLessThan(0.9);
    });
  });

  describe("runKycVerification - full pipeline", () => {
    it("should reject an image that is too small (< 5000 bytes)", async () => {
      // Create a tiny image
      const tinyIdCard = await createSyntheticImage(10, 10, "gradient");
      const selfie = await createSyntheticImage(200, 200, "noisy-face");

      const result = await runKycVerification(tinyIdCard, selfie, "Test User");
      
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("trop petite ou corrompue");
    });

    it("should reject an image with solid color (stdDev < 15)", async () => {
      // Solid black image should trigger the "couleur unie" error
      const solidImage = await createSyntheticImage(500, 316, "solid-black");
      const selfie = await createSyntheticImage(200, 200, "noisy-face");

      const result = await runKycVerification(solidImage, selfie, "Test User");
      
      expect(result.approved).toBe(false);
      // When face comparison fails on solid image, it returns "Impossible de traiter les visages"
      expect(result.reason).toMatch(/Impossible de traiter les visages|couleur unie/);
      expect(result.faceMatch.detected).toBe(false);
    });

    it("should process pipeline when document and face have valid variation", async () => {
      // Create an ID-card-like image with proper aspect ratio and noise
      const idCard = await createSyntheticImage(500, 316, "id-card-like");
      // Create a noisy face selfie
      const selfie = await createSyntheticImage(200, 200, "noisy-face");

      const result = await runKycVerification(idCard, selfie, "Test User");
      
      // This should pass document check
      expect(result.document.isLikelyIdCard).toBe(true);
      expect(result.faceMatch.detected).toBe(true);
      
      // The similarity might not meet approval threshold with synthetic images,
      // but we verify the pipeline runs without errors
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.reason).toBeTruthy();
      // Face should be detected and similarity computed
      expect(result.faceMatch.method).toBe("bhattacharyya_multi_histogram_v3");
    });
  });
});
