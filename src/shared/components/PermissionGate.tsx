import type { ReactNode } from 'react';
import { usePermissions } from '@/shared/hooks/usePermissions';

interface PermissionGateProps {
  permission: string;
  children:   ReactNode;
}

// Renders children only if the current user's role has the given permission.
export function PermissionGate({ permission, children }: PermissionGateProps) {
  const { can } = usePermissions();
  if (!can(permission)) return null;
  return <>{children}</>;
}
