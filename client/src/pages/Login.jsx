import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import AuthArt from '../components/art/AuthArt.jsx';

/** Student sign-in. The administrator door lives at /control/login. */

export default function Login({ embedded = false, onClose, onSwitch } = {}) {
  const { login } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      const destination = location.state?.from || (user.role === 'admin' ? '/control' : '/dashboard');
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * The three ways this form can be hosted, in one place so the page version and
   * the landing-panel version can never drift apart:
   *
   *  - `embedded`  the form is inside another page rather than being a page of
   *                 its own, so "back" closes the panel and the cross-links swap
   *                 it instead of navigating;
   *  - `onClose`   what "back to the site" does when embedded;
   *  - `onSwitch`  what "create an account" and the staff door do when embedded.
   *
   * With none of them it is the same form on its own page, with real links.
   */
  const host = {
    wrapper: embedded ? ' auth-wrap--embedded' : '',
    back: embedded ? (
      <button type="button" className="btn btn-ghost btn-sm auth-back" onClick={onClose}>
        <Icon name="arrowLeft" size={15} /> {t('auth.backToSite')}
      </button>
    ) : (
      <Link to="/" className="btn btn-ghost btn-sm auth-back">
        <Icon name="arrowLeft" size={15} /> {t('auth.backToSite')}
      </Link>
    ),
    switchTo: (target, label) =>
      embedded ? (
        <button type="button" className="linklike" onClick={() => onSwitch && onSwitch(target)}>
          {label}
        </button>
      ) : (
        <Link to={target}>{label}</Link>
      ),
  };

  return (
    <div className={`auth-wrap${host.wrapper}`}>
      <div className="auth-split">
        {/* Left: what the student gets. Hidden below 1000px so the form owns
            the whole screen on a phone. */}
        <aside className="auth-art-col">
          <AuthArt variant="login" />
          <div className="auth-art-copy">
            <h2>{t('home.heroTitle')}</h2>
            <p>{t('home.footerBlurb')}</p>
            <ul className="auth-points">
              <li><Icon name="bolt" /> {t('home.trustFree')}</li>
              <li><Icon name="noBank" /> {t('home.trustBank')}</li>
              <li><Icon name="lock" /> {t('home.trustSecure')}</li>
            </ul>
          </div>
        </aside>

        {/* Right: the form itself. */}
        <div className="card auth-card">
        <div className="auth-top">{host.back}</div>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>
        <h1 className="text-center" style={{ marginBottom: 4 }}>{t('auth.welcomeBack')}</h1>
        <p className="text-center muted" style={{ marginBottom: 24 }}>
          {t('auth.signInSubtitle')}
        </p>

        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" size={16} />
              <span>{error}</span>
            </div>
          )}

          <FormField label={t('auth.email')} htmlFor="email">
            {(a) => (
              <input
                id="email"
                name="email"
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

          <FormField label={t('auth.password')} htmlFor="password">
            {(a) => (
              <div className="position-relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <div className="d-flex justify-content-between mt-4 smallish">
          <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
          <span className="muted">
            {t('auth.newHere')} {host.switchTo('/register', t('auth.createAccount'))}
          </span>
        </div>

        {/* Staff door, right here — nobody needs to go back home to find it. */}
        <div className="auth-alt mt-4 pt-3 smallish">
          <Icon name="shield" size={15} /> {host.switchTo('/control/login', t('home.link.adminSignIn'))}
        </div>
        </div>
      </div>
    </div>
  );
}
