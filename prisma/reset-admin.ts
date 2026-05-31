// ============================================================
// GK TRAVELS CRM — Reset / Create Admin User
// Run: npx tsx prisma/reset-admin.ts
//
// This script deletes any existing admin and creates a fresh one.
// Use it whenever you need to reset admin credentials.
// ============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt          from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN = {
  name:     'Chinmay',
  email:    'chinmaykelkara@gmail.com',
  password: 'Chinmay#1015',
  role:     'ADMIN' as const,
};

async function main() {
  console.log('🔄 Resetting admin user...');

  // Remove existing user with this email (if any)
  const deleted = await prisma.user.deleteMany({ where: { email: ADMIN.email } });
  if (deleted.count > 0) {
    console.log(`   Deleted ${deleted.count} existing user(s) with email ${ADMIN.email}`);
  }

  // Hash password with bcrypt cost 12
  const passwordHash = await bcrypt.hash(ADMIN.password, 12);

  const admin = await prisma.user.create({
    data: {
      name:         ADMIN.name,
      email:        ADMIN.email,
      passwordHash,
      role:         ADMIN.role,
      isActive:     true,
    },
  });

  console.log('✅ Admin user created successfully');
  console.log('   ID:    ', admin.id);
  console.log('   Name:  ', admin.name);
  console.log('   Email: ', admin.email);
  console.log('   Role:  ', admin.role);
  console.log('');
  console.log('   Login at: http://localhost:3000/login');
  console.log('   Email:    ', ADMIN.email);
  console.log('   Password: ', ADMIN.password);
}

main()
  .catch(e => { console.error('❌ Failed:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
