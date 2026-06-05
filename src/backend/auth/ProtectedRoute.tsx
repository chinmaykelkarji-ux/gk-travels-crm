// ============================================================
// GK TRAVELS CRM — Route Guards
//
// ProtectedRoute — redirects to /login if not authenticated.
//                  Shows a spinner while the session check is in flight.
//
// PublicRoute    — redirects authenticated users to / (or redirectTo).
//                  Prevents authenticated users from seeing the login page.
// ============================================================

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth }                        from './AuthContext';

// ─── Full-screen loading spinner ─────────────────────────────

function AuthLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Checking session…</p>
      </div>
    </div>
  );
}

// ─── ProtectedRoute ───────────────────────────────────────────

interface ProtectedRouteProps {
  redirectTo?: string;
  // permission?: Permission  — add when you need fine-grained guards
}

export function ProtectedRoute({ redirectTo = '/login' }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthLoading />;

  if (!isAuthenticated) {
    // Pass the attempted location so LoginPage can redirect back after sign-in
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <Outlet />;
}

// ─── PublicRoute ──────────────────────────────────────────────

interface PublicRouteProps {
  redirectTo?: string;
}

export function PublicRoute({ redirectTo = '/' }: PublicRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <AuthLoading />;

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
