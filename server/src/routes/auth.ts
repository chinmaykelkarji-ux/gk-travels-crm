// ============================================================
// GK TRAVELS CRM — Auth Routes (single-user stub)
//
// Authentication removed. /me returns the hardcoded local user.
// Login / logout / password endpoints are gone.
// ============================================================

import { Router } from 'express';

const router = Router();

// GET /api/auth/me — returns hardcoded local user
router.get('/me', (_req, res) => {
  res.json({
    user: {
      id:       'local-admin',
      email:    'chinmaykelkara@gmail.com',
      name:     'Chinmay',
      role:     'ADMIN',
      isActive: true,
    },
  });
});

export default router;
