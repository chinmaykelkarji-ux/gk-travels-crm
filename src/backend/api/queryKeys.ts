// ============================================================
// GK TRAVELS CRM — TanStack Query Key Factory
//
// Centralised key definitions ensure:
//   - Consistent cache invalidation
//   - Predictable refetch scoping
//   - No "magic string" bugs
//
// Convention: ['entity', orgId, ...specifics]
// ============================================================

export const Q = {
  trips: {
    all:    (orgId: string) => ['trips', orgId] as const,
    list:   (orgId: string, filters?: Record<string, unknown>) =>
              ['trips', orgId, 'list', filters ?? {}] as const,
    detail: (orgId: string, id: string) =>
              ['trips', orgId, 'detail', id] as const,
    count:  (orgId: string) => ['trips', orgId, 'count'] as const,
    departing: (orgId: string, days: number) =>
              ['trips', orgId, 'departing', days] as const,
  },

  leads: {
    all:    (orgId: string) => ['leads', orgId] as const,
    list:   (orgId: string, filters?: Record<string, unknown>) =>
              ['leads', orgId, 'list', filters ?? {}] as const,
    detail: (orgId: string, id: string) =>
              ['leads', orgId, 'detail', id] as const,
    count:  (orgId: string) => ['leads', orgId, 'count'] as const,
  },

  customers: {
    all:    (orgId: string) => ['customers', orgId] as const,
    list:   (orgId: string, filters?: Record<string, unknown>) =>
              ['customers', orgId, 'list', filters ?? {}] as const,
    detail: (orgId: string, id: string) =>
              ['customers', orgId, 'detail', id] as const,
  },

  payments: {
    forTrip: (orgId: string, tripId: string) =>
              ['payments', orgId, 'trip', tripId] as const,
    monthly: (orgId: string, month: string) =>
              ['payments', orgId, 'monthly', month] as const,
  },

  bookings: {
    all:    (orgId: string) => ['bookings', orgId] as const,
    forTrip: (orgId: string, tripId: string) =>
              ['bookings', orgId, 'trip', tripId] as const,
  },

  activity: {
    recent:    (orgId: string) => ['activity', orgId, 'recent'] as const,
    forEntity: (orgId: string, entityType: string, entityId: string) =>
              ['activity', orgId, entityType, entityId] as const,
  },

  finance: {
    portfolio: (orgId: string) => ['finance', orgId, 'portfolio'] as const,
    monthly:   (orgId: string) => ['finance', orgId, 'monthly'] as const,
  },

  auth: {
    session: ['auth', 'session'] as const,
    profile: (userId: string) => ['auth', 'profile', userId] as const,
  },
} as const;
