import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { FactoryPage } from '@/pages/admin/FactoryPage';
import { PurchaseOrdersPage } from '@/pages/admin/PurchaseOrdersPage';
import { PurchaseOrderDetailPage } from '@/pages/admin/PurchaseOrderDetailPage';
import { CustomersPage } from '@/pages/admin/CustomersPage';
import { ProductsPage } from '@/pages/admin/ProductsPage';
import { MachinesPage } from '@/pages/admin/MachinesPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { QCReportsPage } from '@/pages/admin/QCReportsPage';
import { ROLES } from '@/api/types';

// Root component. On first load, if a token was restored from localStorage we re-validate it
// against /auth/me (the backend is the source of truth); success re-hydrates the session,
// failure clears it. Until that resolves, status stays 'loading' so we don't flash /login.
export default function App() {
  const { status, token, setSession, setStatus, clear } = useAuthStore();

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!token) {
        setStatus('unauthed');
        return;
      }
      try {
        const user = await authApi.me();
        if (!cancelled) setSession(token, user);
      } catch {
        if (!cancelled) clear();
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
    // Run once on mount; the store setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'loading') {
    return <div className="app-loading">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin area — gated to the admin role. */}
      <Route
        element={<ProtectedRoute allow={[ROLES.ADMIN]} />}
      >
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="factory" element={<FactoryPage />} />
          {/* Legacy path kept so old links/bookmarks still resolve. */}
          <Route path="orders" element={<Navigate to="/admin/factory" replace />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="qc" element={<QCReportsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="machines" element={<MachinesPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>

      {/* Default: send everyone to the admin dashboard (guard handles auth). */}
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}
