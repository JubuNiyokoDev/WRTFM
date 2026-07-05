// Seed Admin Script
// Creates the initial admin user if it doesn't exist

import { db, usersTable, walletsTable } from "@/db";
import { hashPassword } from "@/lib/auth-security";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@wrtfm.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change_me_in_production";
const ADMIN_NAME = "System Administrator";

export async function seedAdmin(): Promise<void> {
  console.log("Checking for admin user...");

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL));

  if (existing.length > 0) {
    console.log("Admin user already exists, skipping seed");
    return;
  }

  console.log("Creating admin user...");

  const [admin] = await db
    .insert(usersTable)
    .values({
      email: ADMIN_EMAIL,
      password: await hashPassword(ADMIN_PASSWORD),
      name: ADMIN_NAME,
      role: "admin",
      country: null,
      language: "en",
      reputationScore: 100,
      isActive: true,
    })
    .returning();

  // Create wallet for admin
  await db.insert(walletsTable).values({
    userId: admin.id,
    balance: 0,
    currency: "USD",
    totalEarned: 0,
    totalSpent: 0,
    pendingBalance: 0,
  });

  console.log("Admin user created successfully");
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log("⚠️  IMPORTANT: Change the admin password in production!");
}

// Seed admin is called automatically by backend/src/index.ts on server startup.
