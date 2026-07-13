import { createHmac } from "node:crypto";

export type NowPaymentsPayoutRequest = {
  transactionId: number;
  amountUsd: number;
  payoutCurrency: string;
  payoutAddress: string;
  ipnCallbackUrl?: string | null;
};

export type NowPaymentsPayoutResult = {
  payoutId: string | null;
  batchWithdrawalId: string | null;
  providerStatus: string;
  estimatedCryptoAmount: number;
  raw: Record<string, unknown>;
  verification?: {
    attempted: boolean;
    status: number;
    raw: Record<string, unknown> | string | null;
  };
};

function baseUrl(): string {
  return (process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1").replace(/\/+$/, "");
}

function requireConfig() {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  const email = process.env.NOWPAYMENTS_PAYOUT_EMAIL;
  const password = process.env.NOWPAYMENTS_PAYOUT_PASSWORD;
  if (!apiKey || !email || !password) {
    throw new Error(
      "NOWPayments payouts are not configured. Required: NOWPAYMENTS_API_KEY, NOWPAYMENTS_PAYOUT_EMAIL, NOWPAYMENTS_PAYOUT_PASSWORD.",
    );
  }
  return { apiKey, email, password };
}

export function assertValidNowPaymentsCallbackUrl(callbackUrl?: string | null) {
  if (!callbackUrl) return;
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error("NOWPayments payout callback URL is invalid.");
  }
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    throw new Error("NOWPayments payout callback URL must be public; localhost cannot receive provider IPN callbacks.");
  }
  if (parsed.hostname === "api.nowpayments.io") {
    throw new Error("NOWPayments payout callback URL must point to this backend, not to the NOWPayments API.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("NOWPayments payout callback URL must use HTTPS.");
  }
}

function normalizeCurrency(value: string): string {
  return value.trim().toLowerCase();
}

async function readProviderBody(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

async function authenticate(email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl()}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readProviderBody(response);
  if (!response.ok || !body || typeof body !== "object" || typeof body.token !== "string") {
    throw new Error(`NOWPayments auth failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.token;
}

async function estimateUsdToCrypto(apiKey: string, amountUsd: number, payoutCurrency: string): Promise<number> {
  const url = new URL(`${baseUrl()}/estimate`);
  url.searchParams.set("amount", amountUsd.toFixed(2));
  url.searchParams.set("currency_from", "usd");
  url.searchParams.set("currency_to", payoutCurrency);

  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readProviderBody(response);
  const estimated =
    body && typeof body === "object"
      ? Number((body as any).estimated_amount ?? (body as any).amount_to ?? (body as any).amount)
      : NaN;

  if (!response.ok || !Number.isFinite(estimated) || estimated <= 0) {
    throw new Error(`NOWPayments estimate failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return estimated;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 16) throw new Error("Invalid base32 TOTP secret.");
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value === -1) throw new Error("Invalid base32 TOTP secret.");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, now = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(now / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function pickPayoutId(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.id,
    payload.payout_id,
    payload.batch_withdrawal_id,
    payload.batchWithdrawalId,
    (Array.isArray(payload.withdrawals) ? (payload.withdrawals[0] as any)?.id : undefined),
  ];
  const found = candidates.find((value) => typeof value === "string" || typeof value === "number");
  return found == null ? null : String(found);
}

function pickProviderStatus(payload: Record<string, unknown>): string {
  const status =
    payload.status ??
    payload.payout_status ??
    (Array.isArray(payload.withdrawals) ? (payload.withdrawals[0] as any)?.status : undefined);
  return typeof status === "string" ? status : "created";
}

async function verifyPayoutIfConfigured(token: string, batchWithdrawalId: string) {
  const secret = process.env.NOWPAYMENTS_PAYOUT_TOTP_SECRET;
  if (!secret) return undefined;

  const response = await fetch(`${baseUrl()}/payout/${batchWithdrawalId}/verify`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ verification_code: generateTotp(secret) }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readProviderBody(response);
  return {
    attempted: true,
    status: response.status,
    raw: body,
  };
}

export async function createNowPaymentsPayout(request: NowPaymentsPayoutRequest): Promise<NowPaymentsPayoutResult> {
  const { apiKey, email, password } = requireConfig();
  assertValidNowPaymentsCallbackUrl(request.ipnCallbackUrl);
  const payoutCurrency = normalizeCurrency(request.payoutCurrency);
  const estimatedCryptoAmount = await estimateUsdToCrypto(apiKey, request.amountUsd, payoutCurrency);
  const token = await authenticate(email, password);

  const payload = {
    ipn_callback_url: request.ipnCallbackUrl || undefined,
    payout_description: `WRTFM withdrawal #${request.transactionId}`,
    withdrawals: [
      {
        address: request.payoutAddress.trim(),
        currency: payoutCurrency,
        amount: String(estimatedCryptoAmount),
        ipn_callback_url: request.ipnCallbackUrl || undefined,
      },
    ],
  };

  const response = await fetch(`${baseUrl()}/payout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await readProviderBody(response);
  if (!response.ok || !body || typeof body !== "object") {
    throw new Error(`NOWPayments payout failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const batchWithdrawalId = pickPayoutId(body);
  const verification = batchWithdrawalId ? await verifyPayoutIfConfigured(token, batchWithdrawalId) : undefined;

  return {
    payoutId: pickPayoutId(body),
    batchWithdrawalId,
    providerStatus: pickProviderStatus(body),
    estimatedCryptoAmount,
    raw: body,
    verification,
  };
}
