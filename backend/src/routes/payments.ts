import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, transactionsTable, walletsTable, usersTable } from "@/db";
import { getUserIdFromToken } from "./auth";
import { logWalletTransaction } from "@/lib/audit-logger";
import { broadcastNotification, createPaymentConfirmedNotification, createWalletCreditedNotification } from "@/lib/notifications";
import { strictRateLimit } from "@/middlewares/rate-limit";

const router: IRouter = Router();

const createCryptoDepositBody = z.object({
  amount: z.number().positive().max(100_000),
  priceCurrency: z.string().min(3).max(8).default("usd"),
  payCurrency: z.string().min(2).max(16).optional(),
});

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

async function getOrCreateWallet(userId: number) {
  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet) {
    [wallet] = await db.insert(walletsTable).values({
      userId,
      balance: 0,
      currency: "USD",
      totalEarned: 0,
      totalSpent: 0,
      pendingBalance: 0,
    }).returning();
  }
  return wallet;
}

function nowPaymentsBaseUrl(): string {
  return (process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1").replace(/\/+$/, "");
}

function ipnCallbackUrl(): string | null {
  if (process.env.NOWPAYMENTS_IPN_URL) return process.env.NOWPAYMENTS_IPN_URL;
  if (!process.env.PUBLIC_API_URL) return null;
  return `${process.env.PUBLIC_API_URL.replace(/\/+$/, "")}/api/payments/nowpayments/ipn`;
}

function payoutTransactionStatus(status: string): "pending" | "completed" | "failed" | "cancelled" {
  const normalized = status.toLowerCase();
  if (["finished", "confirmed", "completed", "success", "sent"].includes(normalized)) return "completed";
  if (["failed", "rejected", "refunded"].includes(normalized)) return "failed";
  if (["expired", "cancelled", "canceled"].includes(normalized)) return "cancelled";
  return "pending";
}

router.post("/payments/crypto/deposit", strictRateLimit, async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  const callbackUrl = ipnCallbackUrl();
  if (!apiKey || !callbackUrl) {
    res.status(503).json({ error: "Crypto payments are not configured" });
    return;
  }

  const parsed = createCryptoDepositBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { amount, priceCurrency, payCurrency } = parsed.data;
  const wallet = await getOrCreateWallet(userId);

  const [transaction] = await db.insert(transactionsTable).values({
    walletId: wallet.id,
    type: "deposit",
    amount,
    status: "pending",
    reference: null,
    description: "Crypto deposit awaiting payment",
  }).returning();

  const paymentPayload: Record<string, unknown> = {
    price_amount: amount,
    price_currency: priceCurrency.toLowerCase(),
    order_id: `deposit:${transaction.id}`,
    order_description: `Wallet deposit #${transaction.id}`,
    ipn_callback_url: callbackUrl,
  };
  if (payCurrency) paymentPayload.pay_currency = payCurrency.toLowerCase();

  let payload: Record<string, any> | null = null;
  try {
    const response = await fetch(`${nowPaymentsBaseUrl()}/payment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });
    if (response.ok) {
      payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    }
  } catch (err) {
    payload = null;
  }

  // Fallback to simulated instant success in development mode
  const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
  if (!payload && isDev) {
    payload = {
      payment_id: `simulated_${Date.now()}`,
      payment_status: "finished",
      price_amount: amount,
      price_currency: priceCurrency,
      pay_amount: amount / 2500,
      pay_currency: payCurrency || "eth",
      pay_address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      invoice_url: "https://nowpayments.io",
    };
  }

  if (!payload) {
    await db.update(transactionsTable).set({
      status: "failed",
      description: "Crypto payment creation failed",
    }).where(eq(transactionsTable.id, transaction.id));
    res.status(502).json({ error: "Unable to create crypto payment" });
    return;
  }

  const paymentId = payload.payment_id ? String(payload.payment_id) : null;
  const status = providerStatusToTransactionStatus(payload.payment_status ?? "waiting");

  await db.update(transactionsTable).set({
    status,
    reference: paymentId ? `nowpayments:${paymentId}` : `nowpayments:order:${transaction.id}`,
    description: `NOWPayments deposit ${paymentId ?? transaction.id}` + (isDev && !apiKey ? " (Simulated)" : ""),
  }).where(eq(transactionsTable.id, transaction.id));

  if (status === "completed") {
    await db.update(walletsTable).set({
      balance: wallet.balance + amount,
    }).where(eq(walletsTable.id, wallet.id));

    // Retrieve user role for audit logs
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
    if (user && (user.role === "client" || user.role === "worker")) {
      await logWalletTransaction(userId, user.role, "wallet_deposit", amount, transaction.id);
    }
  }

  res.status(201).json({
    transactionId: transaction.id,
    provider: "nowpayments",
    paymentId,
    status: payload.payment_status ?? "waiting",
    priceAmount: payload.price_amount ?? amount,
    priceCurrency: payload.price_currency ?? priceCurrency,
    payAmount: payload.pay_amount ?? null,
    payCurrency: payload.pay_currency ?? payCurrency ?? null,
    payAddress: payload.pay_address ?? null,
    paymentUrl: payload.invoice_url ?? null,
    raw: payload,
  });
});

function sortForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForSignature);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortForSignature((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function isValidIpnSignature(body: unknown, signature: string | undefined): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;

  const signedPayload = JSON.stringify(sortForSignature(body));
  const expected = createHmac("sha512", secret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function providerStatusToTransactionStatus(status: string): "pending" | "completed" | "failed" | "cancelled" {
  if (["finished", "confirmed"].includes(status)) return "completed";
  if (["failed", "refunded"].includes(status)) return "failed";
  if (["expired"].includes(status)) return "cancelled";
  return "pending";
}

router.post("/payments/nowpayments/ipn", strictRateLimit, async (req, res): Promise<void> => {
  if (!isValidIpnSignature(req.body, req.header("x-nowpayments-sig") ?? undefined)) {
    res.status(401).json({ error: "Invalid IPN signature" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const paymentId = body.payment_id ? String(body.payment_id) : null;
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  const providerStatus = typeof body.payment_status === "string" ? body.payment_status : "waiting";
  const status = providerStatusToTransactionStatus(providerStatus);

  let transaction = paymentId
    ? (await db.select().from(transactionsTable).where(eq(transactionsTable.reference, `nowpayments:${paymentId}`)))[0]
    : undefined;

  if (!transaction && orderId?.startsWith("deposit:")) {
    const transactionId = Number(orderId.replace("deposit:", ""));
    if (Number.isInteger(transactionId)) {
      transaction = (await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId)))[0];
    }
  }

  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  await db.update(transactionsTable).set({
    status,
    reference: paymentId ? `nowpayments:${paymentId}` : transaction.reference,
    description: `NOWPayments ${providerStatus}`,
  }).where(eq(transactionsTable.id, transaction.id));

  if (status === "completed" && transaction.status !== "completed") {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, transaction.walletId));
    if (wallet) {
      await db.update(walletsTable).set({
        balance: wallet.balance + transaction.amount,
      }).where(eq(walletsTable.id, wallet.id));

      // Retrieve user role for audit logs
      const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, wallet.userId));
      if (user && (user.role === "client" || user.role === "worker")) {
        await logWalletTransaction(wallet.userId, user.role, "wallet_deposit", transaction.amount, transaction.id);
      }

      // Broadcast notification
      await broadcastNotification(createPaymentConfirmedNotification(
        wallet.userId,
        transaction.amount,
        transaction.id
      ));
      await broadcastNotification(createWalletCreditedNotification(
        wallet.userId,
        transaction.amount,
        wallet.balance + transaction.amount
      ));
    }
  }

  res.json({ message: "IPN processed" });
});

router.post("/payments/nowpayments/payout-ipn", strictRateLimit, async (req, res): Promise<void> => {
  if (!isValidIpnSignature(req.body, req.header("x-nowpayments-sig") ?? undefined)) {
    res.status(401).json({ error: "Invalid IPN signature" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const payoutId =
    body.payout_id ??
    body.batch_withdrawal_id ??
    body.id ??
    (Array.isArray(body.withdrawals) ? (body.withdrawals[0] as any)?.id : undefined);
  if (payoutId == null) {
    res.status(400).json({ error: "Missing payout identifier" });
    return;
  }

  const reference = `nowpayments:payout:${String(payoutId)}`;
  const transaction = (await db.select().from(transactionsTable).where(eq(transactionsTable.reference, reference)))[0];
  if (!transaction) {
    res.status(404).json({ error: "Payout transaction not found" });
    return;
  }

  const providerStatus =
    typeof body.status === "string"
      ? body.status
      : typeof body.payout_status === "string"
        ? body.payout_status
        : "waiting";
  const status = payoutTransactionStatus(providerStatus);

  await db.update(transactionsTable).set({
    status,
    description: `NOWPayments payout ${providerStatus}`,
  }).where(eq(transactionsTable.id, transaction.id));

  if ((status === "failed" || status === "cancelled") && transaction.status === "pending") {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, transaction.walletId));
    if (wallet) {
      await db.update(walletsTable).set({
        balance: wallet.balance + transaction.amount,
      }).where(eq(walletsTable.id, wallet.id));
    }
  }

  res.json({ message: "Payout IPN processed" });
});

export default router;
