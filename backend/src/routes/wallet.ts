import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, walletsTable, transactionsTable } from "@/db";
import {
  GetWalletResponse,
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  DepositFundsBody,
  DepositFundsResponse,
  WithdrawFundsResponse,
  WithdrawFundsBody,
} from "@/api-zod";
import { getUserIdFromToken } from "./auth";
import { logWalletTransaction } from "@/lib/audit-logger";
import { usersTable } from "@/db";
import { strictRateLimit } from "@/middlewares/rate-limit";
import { createNowPaymentsPayout } from "@/lib/nowpayments-payout";

const router: IRouter = Router();
const MIN_WITHDRAWAL_USD = Number(process.env.MIN_WITHDRAWAL_USD ?? "5");

function payoutIpnCallbackUrl(): string | null {
  if (process.env.NOWPAYMENTS_PAYOUT_IPN_URL) return process.env.NOWPAYMENTS_PAYOUT_IPN_URL;
  if (!process.env.PUBLIC_API_URL) return null;
  return `${process.env.PUBLIC_API_URL.replace(/\/+$/, "")}/api/payments/nowpayments/payout-ipn`;
}

function getRequestUserId(req: any): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getUserIdFromToken(authHeader.slice(7));
}

router.get("/wallet", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet) {
    // auto-create wallet
    [wallet] = await db.insert(walletsTable).values({
      userId,
      balance: 0,
      currency: "USD",
      totalEarned: 0,
      totalSpent: 0,
      pendingBalance: 0,
    }).returning();
  }

  res.json(GetWalletResponse.parse(wallet));
});

router.get("/wallet/transactions", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = ListTransactionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { page = 1, limit = 20 } = params.data;
  const offset = (page - 1) * limit;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet) {
    res.json(ListTransactionsResponse.parse({ items: [], total: 0, page, limit }));
    return;
  }

  const [transactions, countResult] = await Promise.all([
    db.select().from(transactionsTable)
      .where(eq(transactionsTable.walletId, wallet.id))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(transactionsTable)
      .where(eq(transactionsTable.walletId, wallet.id)),
  ]);

  res.json(ListTransactionsResponse.parse({
    items: transactions.map(t => ({
      ...t,
      reference: t.reference ?? null,
      description: t.description ?? null,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  }));
});

router.post("/wallet/deposit", strictRateLimit, async (req, res): Promise<void> => {
  if (process.env.ENABLE_MANUAL_WALLET_DEPOSITS !== "true") {
    res.status(410).json({ error: "Manual deposits are disabled. Use /api/payments/crypto/deposit." });
    return;
  }

  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = DepositFundsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet) {
    [wallet] = await db.insert(walletsTable).values({ userId, balance: 0, currency: "USD", totalEarned: 0, totalSpent: 0, pendingBalance: 0 }).returning();
  }

  const [tx] = await db.insert(transactionsTable).values({
    walletId: wallet.id,
    type: "deposit",
    amount: parsed.data.amount,
    status: "completed",
    description: `Deposit via ${parsed.data.method ?? "manual"}`,
  }).returning();

  await db.update(walletsTable).set({
    balance: wallet.balance + parsed.data.amount,
  }).where(eq(walletsTable.id, wallet.id));

  // Retrieve user role for audit logs
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (user && (user.role === "client" || user.role === "worker")) {
    await logWalletTransaction(userId, user.role, "wallet_deposit", parsed.data.amount, tx.id);
  }

  res.json(DepositFundsResponse.parse({
    ...tx,
    reference: tx.reference ?? null,
    description: tx.description ?? null,
  }));
});

router.post("/wallet/withdraw", strictRateLimit, async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = WithdrawFundsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [currentUser] = await db
    .select({ role: usersTable.role, kycStatus: usersTable.kycStatus })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (currentUser.kycStatus !== "verified") {
    res.status(403).json({
      error: "KYC verified status is required before withdrawals.",
      kycStatus: currentUser.kycStatus,
    });
    return;
  }

  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet || wallet.balance < parsed.data.amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }
  if (parsed.data.amount < MIN_WITHDRAWAL_USD) {
    res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD}.` });
    return;
  }

  const payoutCurrency = parsed.data.method.trim().toLowerCase();
  const payoutAddress = parsed.data.accountDetails?.trim();
  if (!/^[a-z0-9_:-]{2,24}$/.test(payoutCurrency)) {
    res.status(400).json({ error: "Invalid payout currency. Use a NOWPayments currency code like trx, btc, usdttrc20." });
    return;
  }
  if (!payoutAddress || payoutAddress.length < 5) {
    res.status(400).json({ error: "Payout address or ChangeNOW PRO email is required." });
    return;
  }

  const [tx] = await db.insert(transactionsTable).values({
    walletId: wallet.id,
    type: "withdrawal",
    amount: parsed.data.amount,
    status: "pending",
    description: `NOWPayments payout requested: ${payoutCurrency}`,
  }).returning();

  let payout;
  try {
    payout = await createNowPaymentsPayout({
      transactionId: tx.id,
      amountUsd: parsed.data.amount,
      payoutCurrency,
      payoutAddress,
      ipnCallbackUrl: payoutIpnCallbackUrl(),
    });
  } catch (error) {
    await db.update(transactionsTable).set({
      status: "failed",
      description: error instanceof Error ? error.message : "NOWPayments payout failed",
    }).where(eq(transactionsTable.id, tx.id));
    res.status(502).json({
      error: error instanceof Error ? error.message : "NOWPayments payout failed",
      transactionId: tx.id,
    });
    return;
  }

  await db.update(transactionsTable).set({
    status: "pending",
    reference: payout.batchWithdrawalId
      ? `nowpayments:payout:${payout.batchWithdrawalId}`
      : payout.payoutId
        ? `nowpayments:payout:${payout.payoutId}`
        : `nowpayments:payout:transaction:${tx.id}`,
    description:
      `NOWPayments payout ${payout.providerStatus}: ${parsed.data.amount.toFixed(2)} USD -> ` +
      `${payout.estimatedCryptoAmount} ${payoutCurrency}` +
      (payout.verification?.attempted ? `; 2FA verify status ${payout.verification.status}` : ""),
  }).where(eq(transactionsTable.id, tx.id));

  await db.update(walletsTable).set({
    balance: wallet.balance - parsed.data.amount,
  }).where(eq(walletsTable.id, wallet.id));

  // Retrieve user role for audit logs
  if (currentUser.role === "client" || currentUser.role === "worker") {
    await logWalletTransaction(userId, currentUser.role, "wallet_withdrawal", parsed.data.amount, tx.id);
  }

  res.json(WithdrawFundsResponse.parse({
    ...tx,
    reference: payout.batchWithdrawalId
      ? `nowpayments:payout:${payout.batchWithdrawalId}`
      : payout.payoutId
        ? `nowpayments:payout:${payout.payoutId}`
        : `nowpayments:payout:transaction:${tx.id}`,
    description:
      `NOWPayments payout ${payout.providerStatus}: ${parsed.data.amount.toFixed(2)} USD -> ` +
      `${payout.estimatedCryptoAmount} ${payoutCurrency}`,
  }));
});

export default router;
