// ============================================================
// GK TRAVELS CRM — Seed RBAC users for a LOCAL / STAGING database
// Run: SEED_USER_PASSWORD='<strong password>' npm run seed:users
//
// Creates one user per role using emails from SEED_USER_DOMAIN
// (default gktravels.local). There are deliberately NO default
// passwords in this file: a previous version shipped four, and
// accounts created with them existed on the production database
// until 2026-09-18. Safe to run multiple times (upsert on email).
// ============================================================

import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_USER_PASSWORD;
const DOMAIN   = process.env.SEED_USER_DOMAIN ?? 'gktravels.local';

const ROLES: { name: string; local: string; role: Role }[] = [
  { name: 'Administrator',        local: 'admin',      role: 'ADMIN' },
  { name: 'Booking Executive',    local: 'booking',    role: 'BOOKING' },
  { name: 'Accounts Executive',   local: 'accounts',   role: 'ACCOUNTS' },
  { name: 'Operations Executive', local: 'operations', role: 'OPERATIONS' },
];

async function main() {
  if (!PASSWORD || PASSWORD.length < 12) {
    console.error('SEED_USER_PASSWORD must be set (min 12 characters). Refusing to seed users with a default password.');
    process.exitCode = 1;
    return;
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'yes') {
    console.error('Refusing to seed users in production without ALLOW_SEED_IN_PRODUCTION=yes.');
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding RBAC users @${DOMAIN}...`);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const u of ROLES) {
    const email    = `${u.local}@${DOMAIN}`.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    await prisma.user.upsert({
      where:  { email },
      update: {},
      create: { name: u.name, email, passwordHash, role: u.role, isActive: true },
    });

    console.log(existing ? `- already existed: ${email}` : `+ created: ${email} (${u.role})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
