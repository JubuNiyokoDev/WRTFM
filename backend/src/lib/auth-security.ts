import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 7);
const AUTH_SECRET = process.env.APP_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && (!AUTH_SECRET || AUTH_SECRET.length < 32)) {
  throw new Error("APP_AUTH_SECRET must be set to at least 32 characters in production");
}

const signingSecret = AUTH_SECRET ?? "development-only-change-me-before-production";

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", signingSecret).update(data).digest("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${PASSWORD_PREFIX}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, salt, encodedHash] = stored.split("$");
  if (prefix !== PASSWORD_PREFIX || !salt || !encodedHash) {
    return false;
  }

  const expected = Buffer.from(encodedHash, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createAuthToken(userId: number): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(JSON.stringify({
    sub: String(userId),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function getUserIdFromAuthToken(token: string): number | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const unsigned = `${header}.${payload}`;
  const expected = sign(unsigned);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const userId = Number(decoded.sub);
    return Number.isInteger(userId) ? userId : null;
  } catch {
    return null;
  }
}
