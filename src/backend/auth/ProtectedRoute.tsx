// ============================================================
// GK TRAVELS CRM — Protected Route Guard
//
// Enforces authentication and optional RBAC permission checks
// on React Router v6 routes via the Outlet pattern.
//
// Usage:
//   <Route element={<ProtectedRoute />}>          — auth only
//   <Route element={<ProtectedRoute permission="finance:view" />}>
// ============================================================

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { hasPermission, type Permission } from './permissions';
import { Skeleton } from '@/shared/components/ui/skeleton';

interface ProtectedRouteProps {
  permission?: Permission;
  redirectTo?: string;
}

export function ProtectedRoute({
  permission,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Session check in progress — show a skeleton to avoid flash of login page
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // Not authenticated → redirect to login, preserving the intended path
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // RBAC: permission check (only runs when a permission prop is provided)
  if (permission && !hasPermission(user!.role, permission)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-500 mt-2">
            Your role ({user!.role}) does not have permission to view this page.
          </p>
          <button
            onClick={() => history.back()}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

// ─── Public-only route ────────────────────────────────────────
// Redirects already-authenticated users away from auth pages.
// Preserves the "from" location set by ProtectedRoute so that
// a user who lands on /login after being redirected ends up
// back at their intended page after signing in.

interface PublicRouteProps {
  redirectTo?: string;
}

export function PublicRoute({ redirectTo = '/' }: PublicRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Wait for session restore — show spinner instead of null to avoid white screen
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? redirectTo;
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
