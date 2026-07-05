import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createAuthToken,
  getUserIdFromAuthToken,
} from "../lib/auth-security";

describe("auth-security", () => {
  describe("hashPassword/verifyPassword", () => {
    it("should complete a successful roundtrip", async () => {
      const password = "correct-horse-battery-staple";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const password = "correct-horse-battery-staple";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("wrong-password", hash);
      expect(isValid).toBe(false);
    });

    it("should produce different hashes for the same password (random salt)", async () => {
      const password = "same-password";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
      // But both should verify correctly
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe("createAuthToken/getUserIdFromAuthToken", () => {
    it("should complete a successful roundtrip", () => {
      const userId = 42;
      const token = createAuthToken(userId);
      const decoded = getUserIdFromAuthToken(token);
      expect(decoded).toBe(userId);
    });

    it("should reject an expired token", () => {
      // Manually construct an expired token
      const userId = 42;
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const expiredPayload = {
        sub: String(userId),
        iat: Math.floor(Date.now() / 1000) - 10000,
        exp: Math.floor(Date.now() / 1000) - 5000, // expired 5000 seconds ago
      };
      const payload = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
      
      // Create valid signature for this expired token
      const crypto = require("node:crypto");
      const signingSecret = process.env.APP_AUTH_SECRET ?? "development-only-change-me-before-production";
      const unsigned = `${header}.${payload}`;
      const signature = crypto.createHmac("sha256", signingSecret).update(unsigned).digest("base64url");
      const expiredToken = `${unsigned}.${signature}`;
      
      const decoded = getUserIdFromAuthToken(expiredToken);
      expect(decoded).toBe(null);
    });

    it("should reject a token with altered signature", () => {
      const userId = 42;
      const token = createAuthToken(userId);
      const [header, payload, signature] = token.split(".");
      // Alter the signature by flipping one character
      const alteredSignature = signature.substring(0, signature.length - 1) + (signature[signature.length - 1] === "A" ? "B" : "A");
      const alteredToken = `${header}.${payload}.${alteredSignature}`;
      const decoded = getUserIdFromAuthToken(alteredToken);
      expect(decoded).toBe(null);
    });

    it("should reject a malformed token (not 3 parts)", () => {
      expect(getUserIdFromAuthToken("invalid")).toBe(null);
      expect(getUserIdFromAuthToken("only.two")).toBe(null);
      expect(getUserIdFromAuthToken("too.many.parts.here")).toBe(null);
    });
  });
});
