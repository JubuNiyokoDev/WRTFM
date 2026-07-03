import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable } from "@workspace/db";
import {
  RegisterBody,
  RegisterResponse,
  LoginBody,
  LoginResponse,
  GetMeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Simple session store (in-memory for this implementation)
const sessions = new Map<string, number>();

function generateToken(): string {
  return `wrtfm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getUserIdFromToken(token: string): number | null {
  const userId = sessions.get(token);
  return userId ?? null;
}

export { getUserIdFromToken };

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name, role, country, language } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    email,
    password, // plain text for demo
    name,
    role: role as "client" | "worker",
    country: country ?? null,
    language: (language as "fr" | "en") ?? "fr",
    reputationScore: 0,
    isActive: true,
  }).returning();

  // Create wallet
  await db.insert(walletsTable).values({
    userId: user.id,
    balance: role === "client" ? 100 : 0, // demo bonus
    currency: "USD",
    totalEarned: 0,
    totalSpent: 0,
    pendingBalance: 0,
  });

  const token = generateToken();
  sessions.set(token, user.id);

  const data = RegisterResponse.parse({
    user: {
      ...user,
      avatarUrl: user.avatarUrl ?? null,
      country: user.country ?? null,
    },
    token,
  });
  res.status(201).json(data);
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || user.password !== password) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = generateToken();
  sessions.set(token, user.id);

  const data = LoginResponse.parse({
    user: {
      ...user,
      avatarUrl: user.avatarUrl ?? null,
      country: user.country ?? null,
    },
    token,
  });
  res.json(data);
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    sessions.delete(authHeader.slice(7));
  }
  res.json({ message: "Logged out" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const data = GetMeResponse.parse({
    ...user,
    avatarUrl: user.avatarUrl ?? null,
    country: user.country ?? null,
  });
  res.json(data);
});

export default router;
