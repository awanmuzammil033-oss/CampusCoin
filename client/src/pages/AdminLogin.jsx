import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setCsrfToken } from '../api.js';
import { applyPreferences } from '../auth.jsx';
import FormField from '../components/FormField.jsx';

/**
 * Administrator sign-in (AUTH-3). It lives at its own address, is styled
 * differently from the student page, and the server refuses student
 * accounts here just as the student page refuses staff accounts.
 */
export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/control-login', { email, password });
      const me = await api.get('/api/auth/me');
      setCsrfToken(me.csrfToken);
      if (me.user?.role !== 'admin') {
        setError('This door is for administrators only.');
        await api.post('/api/auth/logout').catch(() => {});
        return;
      }
      applyPreferences(me.user.theme, me.user.fontScale);
      navigate('/control', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card admin-mode">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>
        <span className="pill pill-suggest d-table mx-auto mb-3">🔐 Administrator</span>
        <h1 className="text-center" style={{ marginBottom: 4 }}>Control panel</h1>
        <p className="text-center muted" style={{ marginBottom: 24 }}>
          Staff access for managing categories, templates and accounts.
        </p>

        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="field-error mb-3" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}
          <FormField label="Work email" htmlFor="admin-email">
            {(a) => (
              <input
                id="admin-email"
                type="email"
                className="input"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                {...a}
              />
            )}
          </FormField>
          <FormField label="Password" htmlFor="admin-password">
            {(a) => (
              <input
                id="admin-password"
                type="password"
                className="input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...a}
              />
            )}
          </FormField>
          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Checking…' : 'Enter control panel'}
          </button>
        </form>

        <p className="smallish text-center mt-4 mb-0 muted">
          Student? <Link to="/login">Go to the student sign-in</Link>
        </p>
      </div>
    </div>
  );
}
