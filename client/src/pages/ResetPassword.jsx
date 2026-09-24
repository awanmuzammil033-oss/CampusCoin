import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import FormField from '../components/FormField.jsx';

/** Step 3: the emailed token lands here in the URL. The server checks it is
 *  unexpired and unused before accepting the new password. */
export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) return setError('The two passwords do not match.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      await api.post('/api/auth/password-reset/confirm', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>

        {done ? (
          <>
            <h1 className="text-center">Password updated</h1>
            <p className="muted text-center">
              You can sign in with your new password now — taking you there in a moment.
            </p>
            <Link className="btn btn-primary w-100" to="/login">Go to sign in</Link>
          </>
        ) : (
          <>
            <h1 className="text-center" style={{ marginBottom: 4 }}>Choose a new password</h1>
            <p className="text-center muted" style={{ marginBottom: 24 }}>
              This link works only once. Pick something you have not used before.
            </p>

            <form onSubmit={onSubmit} noValidate>
              {error && (
                <div className="field-error mb-3" role="alert">
                  <span aria-hidden="true">⚠</span>
                  <span>{error}</span>
                </div>
              )}
              <FormField label="New password" htmlFor="password" help="At least 8 characters.">
                {(a) => (
                  <input
                    id="password"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    {...a}
                  />
                )}
              </FormField>
              <FormField label="Confirm new password" htmlFor="confirm">
                {(a) => (
                  <input
                    id="confirm"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    {...a}
                  />
                )}
              </FormField>
              <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {busy ? 'Saving…' : 'Save new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
