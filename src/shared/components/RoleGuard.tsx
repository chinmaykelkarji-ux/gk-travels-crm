import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/backend/auth/AuthContext';
import type { UserRole } from '@/backend/auth/types';
import { ROLE_LABELS } from '@/backend/auth/permissions';

interface RoleGuardProps {
  allowed:  UserRole[];
  children: ReactNode;
}

// Wraps a page and shows an "Access Denied" screen if the user's role
// isn't in the allowed list. Used at the route level in App.tsx.
export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { user } = useAuth();

  if (user && !allowed.includes(user.role)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-500 mt-1">
            Your role ({ROLE_LABELS[user.role]}) does not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
