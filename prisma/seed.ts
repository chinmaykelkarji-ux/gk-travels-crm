// ============================================================
// GK TRAVELS CRM — Demo seed for a LOCAL / STAGING database
// Run: SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASS='<strong>' npm run db:seed
//
// Credentials come from the environment only. A previous version of this
// file committed a real email and password; that account was rotated on
// 2026-09-18. Refuses to run against production unless explicitly allowed.
// ============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt          from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'yes') {
    throw new Error('Refusing to seed demo data in production without ALLOW_SEED_IN_PRODUCTION=yes');
  }

  console.log('🌱 Seeding database...');

  // ── Organisation (single tenant) ───────────────────────────
  await prisma.organization.upsert({
    where:  { id: 'org_gktravels' },
    update: {},
    create: { id: 'org_gktravels', slug: 'org_gktravels', name: 'GK Travels' },
  });

  // ── Admin user (optional, env-driven) ─────────────────────
  const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const ADMIN_PASS  = process.env.SEED_ADMIN_PASS;

  if (!ADMIN_EMAIL || !ADMIN_PASS || ADMIN_PASS.length < 12) {
    console.log('ℹ️  Admin seed skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASS (min 12 chars) to create one.');
  } else {
    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
      const admin = await prisma.user.create({
        data: {
          email:    ADMIN_EMAIL,
          passwordHash,
          name:     process.env.SEED_ADMIN_NAME ?? 'Admin',
          role:     'ADMIN',
          isActive: true,
        },
      });
      console.log('✅ Admin created:', admin.email);
    } else {
      console.log('✅ Admin already exists:', existing.email);
    }
  }

  // ── Demo customer ──────────────────────────────────────────
  await prisma.customer.upsert({
    where:  { id: 'CUST-DEMO-0001' },
    update: {},
    create: {
      id:          'CUST-DEMO-0001',
      name:        'Rahul Sharma',
      phone:       '9876543210',
      email:       'rahul@example.com',
      city:        'Mumbai',
      tripIds:     ['GK-2025-0001'],
      createdDate: '2025-01-15',
    },
  });

  // ── Demo trip ──────────────────────────────────────────────
  await prisma.trip.upsert({
    where:  { id: 'GK-2025-0001' },
    update: {},
    create: {
      id:           'GK-2025-0001',
      customer:     'Rahul Sharma',
      phone:        '9876543210',
      email:        'rahul@example.com',
      customerId:   'CUST-DEMO-0001',
      destination:  'Dubai',
      type:         'Honeymoon Package',
      pax:          2,
      departure:    '2025-08-10',
      returnDate:   '2025-08-17',
      status:       'confirmed',
      totalAmount:  180000,
      gstRate:      5,
      gstAmount:    9000,
      totalPayable: 189000,
      paidAmount:   100000,
      balanceDue:   89000,
      supplierCost: 140000,
      grossMargin:  40000,
      marginPct:    22.2,
      flightStatus: 'issued',
      hotelStatus:  'booked',
      visaStatus:   'approved',
      checkInStatus:'not_due',
      notes:        'Honeymoon couple — arrange flowers in room',
      createdDate:  '2025-01-15',
      timeline: [
        { id: 'tl-1', date: '2025-01-15', event: 'Trip created — Dubai', type: 'system' },
        { id: 'tl-2', date: '2025-01-20', event: 'Status changed to confirmed', type: 'system' },
      ],
    },
  });

  // ── Demo lead ──────────────────────────────────────────────
  await prisma.lead.upsert({
    where:  { id: 'L-2025-0001' },
    update: {},
    create: {
      id:           'L-2025-0001',
      name:         'Priya Mehta',
      phone:        '9123456789',
      email:        'priya@example.com',
      source:       'Instagram',
      destination:  'Bali',
      pax:          2,
      budget:       120000,
      tripType:     'Honeymoon',
      status:       'follow_up',
      priority:     'high',
      notes:        'Interested in Bali — June dates',
      followUpDate: '2025-06-01',
      createdDate:  '2025-05-20',
      timeline: [{ id: 'lt-1', date: '2025-05-20', event: 'Lead created', type: 'system' }],
    },
  });

  // ── Demo payment ───────────────────────────────────────────
  await prisma.payment.upsert({
    where:  { id: 'PAY-0001' },
    update: {},
    create: {
      id:        'PAY-0001',
      type:      'customer',
      tripId:    'GK-2025-0001',
      customer:  'Rahul Sharma',
      amount:    100000,
      method:    'Bank Transfer / NEFT',
      date:      '2025-01-20',
      status:    'received',
      reference: 'NEFT202501200001',
    },
  });

  console.log('✅ Seed complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
