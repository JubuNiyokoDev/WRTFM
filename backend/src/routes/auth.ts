import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable } from "@/db";
import { createAuthToken, getUserIdFromAuthToken, hashPassword, verifyPassword } from "@/lib/auth-security";
import {
  RegisterBody,
  RegisterResponse,
  LoginBody,
  LoginResponse,
  GetMeResponse,
} from "@/api-zod";
import { authRateLimit } from "@/middlewares/rate-limit";
import { logAuditEvent, logUserLogin, logUserLogout } from "@/lib/audit-logger";

const router: IRouter = Router();

function getUserIdFromToken(token: string): number | null {
  return getUserIdFromAuthToken(token);
}

export { getUserIdFromToken };

function toPublicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    country: user.country ?? null,
    language: user.language,
    avatarUrl: user.avatarUrl ?? null,
    isActive: user.isActive,
    reputationScore: user.reputationScore,
    kycStatus: user.kycStatus,
    createdAt: user.createdAt,
  };
}

router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
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
    password: await hashPassword(password),
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
    balance: 0,
    currency: "USD",
    totalEarned: 0,
    totalSpent: 0,
    pendingBalance: 0,
  });

  await logAuditEvent({
    userId: user.id,
    userType: user.role,
    action: "user_register",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] as string,
    success: true,
  });

  const token = createAuthToken(user.id);

  const data = RegisterResponse.parse({
    user: toPublicUser(user),
    token,
  });
  res.status(201).json(data);
});

router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  let passwordMatches = user ? await verifyPassword(password, user.password) : false;

  if (user && !passwordMatches && !user.password.startsWith("scrypt$") && user.password === password) {
    passwordMatches = true;
    await db.update(usersTable).set({ password: await hashPassword(password) }).where(eq(usersTable.id, user.id));
  }

  if (!user || !user.isActive || !passwordMatches) {
    await logAuditEvent({
      userId: user ? user.id : undefined,
      userType: user ? user.role : undefined,
      action: "user_login",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
      success: false,
      errorMessage: "Invalid email or password",
    });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = createAuthToken(user.id);

  await logUserLogin(
    user.id,
    user.role,
    req.ip,
    req.headers["user-agent"] as string
  );

  const data = LoginResponse.parse({
    user: toPublicUser(user),
    token,
  });
  res.json(data);
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const userId = getUserIdFromToken(token);
    if (userId) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (user) {
        await logUserLogout(user.id, user.role, req.ip);
      }
    }
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
    ...toPublicUser(user),
  });
  res.json(data);
});

export default router;
