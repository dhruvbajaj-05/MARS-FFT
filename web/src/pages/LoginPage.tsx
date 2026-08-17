import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { ROLES } from '@/api/types';

// Login screen. Posts to /auth/login, stores the session, then routes by role. Today only
// the admin area exists on web, so non-admins are told the web console isn't available for
// their role yet (their access lives in the mobile app).
export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user } = await authApi.login(email.trim(), password);
      if (user.role !== ROLES.ADMIN) {
        // Keep the token out of the store; the web console is admin-only for now.
        clear();
        setError('The web console is currently available to administrators only. Please use the mobile app for your role.');
        return;
      }
      setSession(token, user);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Check your email and password.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brandside">
        <div className="login-brandmark"><img src="/logo.png" alt="fun factory" /></div>
        <h1>MARS FFT Console</h1>
        <p>Real-time visibility across moulding, assembly, QC and dispatch — for administrators.</p>
      </div>

      <div className="login-formside">
        <form className="login-card" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          <p className="login-sub">Use your MARS FFT administrator account.</p>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@fft.com"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
