import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, walletsTable, transactionsTable } from "@workspace/db";
import {
  GetWalletResponse,
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  DepositFundsBody,
  DepositFundsResponse,
  WithdrawFundsResponse,
  WithdrawFundsBody,
} from "@workspace/api-zod";
import { getUserIdFromToken } from "./auth";

const router: IRouter = Router();

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

router.post("/wallet/deposit", async (req, res): Promise<void> => {
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

  res.json(DepositFundsResponse.parse({
    ...tx,
    reference: tx.reference ?? null,
    description: tx.description ?? null,
  }));
});

router.post("/wallet/withdraw", async (req, res): Promise<void> => {
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

  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallet || wallet.balance < parsed.data.amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  const [tx] = await db.insert(transactionsTable).values({
    walletId: wallet.id,
    type: "withdrawal",
    amount: parsed.data.amount,
    status: "pending",
    description: `Withdrawal via ${parsed.data.method}`,
  }).returning();

  await db.update(walletsTable).set({
    balance: wallet.balance - parsed.data.amount,
  }).where(eq(walletsTable.id, wallet.id));

  res.json(WithdrawFundsResponse.parse({
    ...tx,
    reference: tx.reference ?? null,
    description: tx.description ?? null,
  }));
});

export default router;
