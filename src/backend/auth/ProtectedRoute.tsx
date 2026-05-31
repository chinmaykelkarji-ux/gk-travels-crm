// ============================================================
// GK TRAVELS CRM — ProtectedRoute (passthrough stub)
//
// Authentication removed. Both components render Outlet
// unconditionally. Kept for import compatibility.
// ============================================================

import { Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  permission?: string;
  redirectTo?: string;
}

export function ProtectedRoute(_props: ProtectedRouteProps) {
  return <Outlet />;
}

interface PublicRouteProps {
  redirectTo?: string;
}

export function PublicRoute(_props: PublicRouteProps) {
  return <Outlet />;
}
