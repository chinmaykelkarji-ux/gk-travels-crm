// ============================================================
// GK TRAVELS CRM — Seed default RBAC users
// Run: npm run seed:users
// Safe to run multiple times (upsert on email).
// ============================================================

import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_USERS: { name: string; email: string; password: string; role: Role }[] = [
  { name: 'Administrator',       email: 'admin@gktravels.com',      password: 'Admin@1234',      role: 'ADMIN' },
  { name: 'Booking Executive',   email: 'booking@gktravels.com',    password: 'Booking@1234',    role: 'BOOKING' },
  { name: 'Accounts Executive',  email: 'accounts@gktravels.com',   password: 'Accounts@1234',   role: 'ACCOUNTS' },
  { name: 'Operations Executive', email: 'operations@gktravels.com', password: 'Operations@1234', role: 'OPERATIONS' },
];

async function main() {
  console.log('Seeding default RBAC users...');

  for (const u of DEFAULT_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    const passwordHash = await bcrypt.hash(u.password, 12);

    await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: {
        name:         u.name,
        email:        u.email,
        passwordHash,
        role:         u.role,
        isActive:     true,
      },
    });

    console.log(existing ? `- already existed: ${u.email}` : `+ created: ${u.email} (${u.role})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
