import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import FormField from '../components/FormField.jsx';

/** Registration (AUTH-1). The same rules are checked server-side too —
 *  this live hint just saves a round trip. */
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(form.password);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      navigate('/dashboard', { replace: true });
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
        <h1 className="text-center" style={{ marginBottom: 4 }}>Create your account</h1>
        <p className="text-center muted" style={{ marginBottom: 24 }}>
          Free for students — no card, no bank connection.
        </p>

        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="field-error mb-3" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <FormField label="Full name" htmlFor="name">
            {(a) => (
              <input id="name" className="input" autoComplete="name" required value={form.name} onChange={update('name')} {...a} />
            )}
          </FormField>

          <FormField label="Email" htmlFor="email" help="You will sign in with this address.">
            {(a) => (
              <input id="email" type="email" className="input" autoComplete="email" required value={form.email} onChange={update('email')} {...a} />
            )}
          </FormField>

          <FormField
            label="Password"
            htmlFor="password"
            help="At least 8 characters — mix words and numbers."
            hint={
              form.password ? (
                <span>
                  Strength:{' '}
                  <strong>{['Too short', 'Weak', 'Okay', 'Strong'][strength.level]}</strong>
                  {' · '}
                  <span className="muted">{strength.tip}</span>
                </span>
              ) : undefined
            }
          >
            {(a) => (
              <div className="position-relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={update('password')}
                  style={{ paddingRight: 72 }}
                  {...a}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm position-absolute"
                  style={{ right: 6, top: 6 }}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            )}
          </FormField>

          <FormField label="Confirm password" htmlFor="confirm">
            {(a) => (
              <input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                className="input"
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={update('confirm')}
                {...a}
              />
            )}
          </FormField>

          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="smallish text-center mt-4 mb-0 muted">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

/** Rough live hint only — the server enforces the real policy. */
function passwordStrength(pw) {
  if (pw.length < 8) return { level: 0, tip: 'Use at least 8 characters.' };
  let score = 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const tips = ['Use at least 8 characters.', 'Add numbers or capitals.', 'Throw in a symbol too.', 'Nice — that is a solid password.'];
  return { level: Math.min(3, score), tip: tips[Math.min(3, score)] };
}
