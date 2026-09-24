import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import FormField from '../components/FormField.jsx';

/** Step 1 of recovery: ask for the address, always answer the same way
 *  so nobody can probe who has an account here. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/password-reset/request', { email });
      setSent(true);
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

        {sent ? (
          <>
            <h1 className="text-center">Check your inbox</h1>
            <p className="muted text-center">
              If that address has an account, a reset link is on its way. It works once and
              expires in an hour.
            </p>
            <div className="d-flex justify-content-center gap-2">
              <Link className="btn btn-secondary" to="/login">Back to sign in</Link>
              <button type="button" className="btn btn-ghost" onClick={() => setSent(false)}>
                Try another address
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-center" style={{ marginBottom: 4 }}>Reset your password</h1>
            <p className="text-center muted" style={{ marginBottom: 24 }}>
              We will email you a one-time link to choose a new password.
            </p>

            <form onSubmit={onSubmit} noValidate>
              {error && (
                <div className="field-error mb-3" role="alert">
                  <span aria-hidden="true">⚠</span>
                  <span>{error}</span>
                </div>
              )}
              <FormField label="Email" htmlFor="email">
                {(a) => (
                  <input
                    id="email"
                    type="email"
                    className="input"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    {...a}
                  />
                )}
              </FormField>
              <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="smallish text-center mt-4 mb-0">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
