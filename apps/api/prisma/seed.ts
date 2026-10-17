import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must contain at least 8 characters.");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { username },
    update: { displayName: process.env.SEED_ADMIN_DISPLAY_NAME ?? "Ahmed Ben Ali", passwordHash, role: UserRole.ADMIN, isActive: true },
    create: { username, displayName: process.env.SEED_ADMIN_DISPLAY_NAME ?? "Ahmed Ben Ali", passwordHash, role: UserRole.ADMIN },
  });
  console.log(`Admin ready: ${user.username} (${user.role})`);
}

main().finally(() => prisma.$disconnect());
