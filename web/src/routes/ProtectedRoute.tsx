import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/api/types';

// Route guard. Redirects to /login when unauthenticated. When `allow` is given, a logged-in
// user whose role is not in the list is bounced to /login too (the backend also enforces
// this via RBAC — this is just a UX guard, not the security boundary).
export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { status, user } = useAuthStore();

  if (status !== 'authed' || !user) {
    return <Navigate to="/login" replace />;
  }
  if (allow && !allow.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
