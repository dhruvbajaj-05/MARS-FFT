import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { ROLE_LABELS } from '@/api/types';

// The admin shell: a fixed left sidebar + a scrollable content area. This is the main
// visual departure from the mobile app (which uses bottom tabs on a dark theme) — a light,
// desktop-first console layout.
export function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  async function onLogout() {
    try {
      await authApi.logout();
    } catch {
      // Ignore — we clear the local session regardless.
    }
    clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark"><img src="/logo.png" alt="MARS FFT" /></div>
          <div>
            <div className="sidebar-title">MARS FFT</div>
            <div className="sidebar-subtitle">Admin Console</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/admin/dashboard" className="nav-item">
            Dashboard
          </NavLink>
          <NavLink to="/admin/purchase-orders" className="nav-item">
            Purchase Orders
          </NavLink>
          <NavLink to="/admin/factory" className="nav-item">
            Factory
          </NavLink>
          <NavLink to="/admin/qc" className="nav-item">
            Quality Control
          </NavLink>

          <div className="nav-heading">Master Data</div>
          <NavLink to="/admin/customers" className="nav-item">
            Customers
          </NavLink>
          <NavLink to="/admin/products" className="nav-item">
            Products
          </NavLink>
          <NavLink to="/admin/machines" className="nav-item">
            Machines
          </NavLink>
          <NavLink to="/admin/users" className="nav-item">
            Users
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{(user?.name ?? '?').slice(0, 1).toUpperCase()}</div>
            <div className="sidebar-user-meta">
              <div className="sidebar-user-name">{user?.name}</div>
              <div className="sidebar-user-role">{user ? ROLE_LABELS[user.role] : ''}</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
