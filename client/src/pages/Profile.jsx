import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Page from '../components/Page.jsx';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';

const YEARS = ['1st year', '2nd year', '3rd year', '4th year'];
const SIZES = { 1: 'Size: 1 of 4', 2: 'Size: 2 of 4', 3: 'Size: 3 of 4', 4: 'Size: 4 of 4' };

/** Money columns arrive as Decimal128 objects — read them the friendly way. */
function plainMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return value.$numberDecimal ?? value.value ?? '';
  return String(value);
}

export default function Profile() {
  const { user, updatePreferences, updateProfile, logout } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    academicYear: '',
    allowance: '',
    goal: '',
  });
  const [theme, setTheme] = useState('light');
  const [fontScale, setFontScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  // Seed the form from the account every time it refreshes (after save, the
  // values the server stored come straight back).
  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || '',
      academicYear: user.academicYear || '',
      allowance: plainMoney(user.monthlyAllowanceBaseline),
      goal: plainMoney(user.monthlySavingsGoal),
    });
    setTheme(user.theme || 'light');
    setFontScale(Number(user.fontScale) || 2);
  }, [user]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function saveDetails(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await updateProfile({
        name: form.name,
        academicYear: form.academicYear,
        monthlyAllowanceBaseline: String(form.allowance).trim(),
        monthlySavingsGoal: String(form.goal).trim(),
      });
      push('Profile saved.');
    } catch (err) {
      setError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function chooseTheme(next) {
    setTheme(next);
    try {
      await updatePreferences({ theme: next });
    } catch (err) {
      push(err.message, 'error');
    }
  }

  async function changeSize(delta) {
    const next = Math.min(4, Math.max(1, fontScale + delta));
    if (next === fontScale) return;
    setFontScale(next);
    try {
      await updatePreferences({ fontScale: next });
    } catch (err) {
      push(err.message, 'error');
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      push(err.message, 'error');
      setSigningOut(false);
    }
  }

  return (
    <Page trail={[{ label: 'Profile & settings' }]} title="Profile & settings" subtitle="Your details, and how the app looks.">
      <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="card">
          <div className="card-title">
            <span>Your details</span>
          </div>

          <form onSubmit={saveDetails} noValidate>
            {error && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <FormField label="Name" htmlFor="profile-name">
              {(a) => (
                <input
                  id="profile-name"
                  className="input"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  {...a}
                />
              )}
            </FormField>

            <FormField label="Email" htmlFor="profile-email" help="Email is your sign-in name.">
              {(a) => (
                <input
                  id="profile-email"
                  className="input"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  disabled
                  {...a}
                />
              )}
            </FormField>

            <FormField label="Academic year" htmlFor="profile-year">
              {(a) => (
                <select
                  id="profile-year"
                  className="input"
                  value={form.academicYear}
                  onChange={(e) => setField('academicYear', e.target.value)}
                  {...a}
                >
                  <option value="">Not set</option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Monthly allowance baseline" htmlFor="profile-allowance" help="A rough figure for what arrives each month.">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="profile-allowance"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.allowance}
                  onChange={(e) => setField('allowance', e.target.value)}
                />
              </div>
            </FormField>

            <FormField label="Monthly savings goal" htmlFor="profile-goal" help="The dashboard tracks how close you are.">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="profile-goal"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.goal}
                  onChange={(e) => setField('goal', e.target.value)}
                />
              </div>
            </FormField>

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'Saving…' : 'Save details'}
            </button>
          </form>
        </section>

        <div className="d-grid gap-3" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-title">
              <span>Appearance</span>
            </div>

            <div className="field">
              <span id="theme-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                Theme
              </span>
              <div className="chip-grid" role="group" aria-labelledby="theme-label">
                <button type="button" className="chip" aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}>
                  ☀️ Light
                </button>
                <button type="button" className="chip" aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}>
                  🌙 Dark
                </button>
              </div>
            </div>

            <div className="field mb-0">
              <span id="size-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                Text size
              </span>
              <div className="d-flex align-items-center gap-2" role="group" aria-labelledby="size-label">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => changeSize(-1)}
                  disabled={fontScale <= 1}
                  aria-label="Decrease text size"
                  title="Smaller text"
                >
                  A−
                </button>
                <span className="num smallish" aria-live="polite">{SIZES[fontScale]}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => changeSize(1)}
                  disabled={fontScale >= 4}
                  aria-label="Increase text size"
                  title="Larger text"
                >
                  A+
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <span>Security</span>
            </div>
            <p className="smallish muted">
              Changing your password sends a time-limited link to your inbox — the same one the
              “forgot password” page uses.
            </p>
            <div className="d-flex gap-2 flex-wrap">
              <Link className="btn btn-secondary btn-sm" to="/forgot-password">
                Change password
              </Link>
              <button type="button" className="btn btn-danger-outline btn-sm" onClick={signOut} disabled={signingOut}>
                {signingOut && <span className="spinner" aria-hidden="true" />}
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}
