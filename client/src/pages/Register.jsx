import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import AuthArt from '../components/art/AuthArt.jsx';
import { CURRENCIES } from '../data/currencies.js';

/** Live-strength label keys — the strings themselves come from t(). */
const LEVEL_KEYS = ['auth.tooShort', 'auth.weak', 'auth.okay', 'auth.strong'];
const TIP_KEYS = ['auth.tipUseEight', 'auth.tipNumbersCapitals', 'auth.tipSymbol', 'auth.tipSolid'];

/** Registration (AUTH-1). The same rules are checked server-side too —
 *  this live hint just saves a round trip. */
export default function Register() {
  const { register } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', currency: 'USD' });
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
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (form.password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setBusy(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        currency: form.currency,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-split">
        {/* Left: the promise of the account. Hidden below 1000px so the form
            owns the whole screen on a phone. */}
        <aside className="auth-art-col">
          <AuthArt variant="register" />
          <div className="auth-art-copy">
            <h2>{t('home.cta2Title')}</h2>
            <p>{t('home.footerBlurb')}</p>
            <ul className="auth-points">
              <li><Icon name="checkCircle" /> {t('home.trustFree')}</li>
              <li><Icon name="noBank" /> {t('home.trustBank')}</li>
              <li><Icon name="shield" /> {t('home.trustSecure')}</li>
            </ul>
          </div>
        </aside>

        {/* Right: the form itself. */}
        <div className="card auth-card auth-register">
        <div className="auth-top">
          <Link to="/" className="btn btn-ghost btn-sm auth-back">
            <Icon name="arrowLeft" size={15} /> {t('auth.backToSite')}
          </Link>
        </div>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>
        <h1 className="text-center" style={{ marginBottom: 2 }}>{t('auth.createYourAccount')}</h1>
        <p className="text-center muted" style={{ marginBottom: 14 }}>
          {t('auth.registerSubtitle')}
        </p>

        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Two columns on wide screens so the whole card fits a laptop
              viewport without scrolling (1366x768 and shorter). */}
          <div className="auth-grid">
            <FormField label={t('auth.fullName')} htmlFor="name">
              {(a) => (
                <input id="name" className="input" autoComplete="name" required value={form.name} onChange={update('name')} {...a} />
              )}
            </FormField>

            <FormField label={t('auth.email')} htmlFor="email" help={t('auth.emailHelp')}>
              {(a) => (
                <input id="email" type="email" className="input" autoComplete="email" required value={form.email} onChange={update('email')} {...a} />
              )}
            </FormField>

            <FormField
              label={t('auth.password')}
              htmlFor="password"
              help={t('auth.passwordHelp')}
              hint={
                form.password ? (
                  <span>
                    {t('auth.strength')}{' '}
                    <strong>{t(LEVEL_KEYS[strength.level])}</strong>
                    {' · '}
                    <span className="muted">{t(TIP_KEYS[strength.tipLevel])}</span>
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
                    {showPassword ? t('auth.hide') : t('auth.show')}
                  </button>
                </div>
              )}
            </FormField>

            <FormField label={t('auth.confirmPassword')} htmlFor="confirm">
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

            {/* What the student's amounts are in. The topbar picker only
                changes how they are shown; this is the currency the ledger
                is actually kept in. */}
            <FormField
              label={t('auth.ownCurrency')}
              htmlFor="currency"
              help={t('auth.ownCurrencyHelp')}
            >
              {(a) => (
                <select
                  id="currency"
                  name="currency"
                  className="input"
                  value={form.currency}
                  onChange={update('currency')}
                  {...a}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? t('auth.creatingAccount') : t('auth.createAccountButton')}
          </button>
        </form>

        <p className="smallish text-center mt-3 mb-0 muted">
          {t('auth.alreadyRegistered')} <Link to="/login">{t('auth.signIn')}</Link>
        </p>
        </div>

        {/* Right: the same card of reasons, so the form sits in the middle. */}
        <aside className="auth-value-col">
          <div className="card auth-value">
            <h2>{t('home.cta2Title')}</h2>
            <ul>
              <li>
                <span className="auth-value-ico"><Icon name="bolt" /></span>
                <span><strong>{t('home.stat1a')}</strong>{t('home.stat1b')}</span>
              </li>
              <li>
                <span className="auth-value-ico"><Icon name="grid" /></span>
                <span><strong>{t('home.stat3a')}</strong>{t('home.stat3b')}</span>
              </li>
              <li>
                <span className="auth-value-ico"><Icon name="shield" /></span>
                <span><strong>{t('home.privC1')}</strong>{t('home.privC2')}</span>
              </li>
              <li>
                <span className="auth-value-ico"><Icon name="noBank" /></span>
                <span><strong>{t('home.privC3')}</strong>{t('home.privC4')}</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Rough live hint only — the server enforces the real policy. Returns key
 *  indexes instead of strings so the caller can translate through t(). */
function passwordStrength(pw) {
  if (pw.length < 8) return { level: 0, tipLevel: 0 };
  let score = 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const tipLevel = Math.min(3, score);
  return { level: Math.min(3, score), tipLevel };
}
