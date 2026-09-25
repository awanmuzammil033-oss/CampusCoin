import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import AuthArt from '../components/art/AuthArt.jsx';

/**
 * Administrator sign-in (AUTH-3). It lives at its own address, is styled
 * differently from the student page, and the server refuses student
 * accounts here just as the student page refuses staff accounts.
 */
export default function AdminLogin() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const { controlLogin, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // controlLogin posts to the staff endpoint AND writes the user into
      // the auth context — without that, RequireAdmin still sees an
      // anonymous visitor and bounces straight back to this page.
      const user = await controlLogin(email, password);
      if (user.role !== 'admin') {
        setError(t('auth.adminOnly'));
        await logout();
        return;
      }
      navigate('/control', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-split">
        {/* Left: what the staff door is for. Hidden below 1000px. */}
        <aside className="auth-art-col">
          <AuthArt variant="admin" />
          <div className="auth-art-copy">
            <h2>{t('auth.controlPanel')}</h2>
            <p>{t('auth.controlSubtitle')}</p>
            <ul className="auth-points">
              <li><Icon name="users" /> {t('ctl.navUsers')}</li>
              <li><Icon name="tag" /> {t('ctl.navCategories')}</li>
              <li><Icon name="clipboard" /> {t('ctl.navTemplates')}</li>
            </ul>
          </div>
        </aside>

        {/* Right: the form itself. */}
        <div className="card auth-card admin-mode">
        <div className="auth-top">
          <Link to="/" className="btn btn-ghost btn-sm auth-back">
            <Icon name="arrowLeft" size={15} /> {t('auth.backToSite')}
          </Link>
        </div>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>
        <span className="pill pill-suggest d-table mx-auto mb-3">
          <Icon name="lock" size={14} /> {t('auth.administrator')}
        </span>
        <h1 className="text-center" style={{ marginBottom: 4 }}>{t('auth.controlPanel')}</h1>
        <p className="text-center muted" style={{ marginBottom: 24 }}>
          {t('auth.controlSubtitle')}
        </p>

        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" size={16} />
              <span>{error}</span>
            </div>
          )}
          <FormField label={t('auth.workEmail')} htmlFor="admin-email">
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
          <FormField label={t('auth.password')} htmlFor="admin-password">
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
            {busy ? t('auth.checking') : t('auth.enterControlPanel')}
          </button>
        </form>

        <p className="smallish text-center mt-4 mb-0 muted">
          {t('auth.studentPrompt')} <Link to="/login">{t('auth.goToStudentSignIn')}</Link>
        </p>
        </div>

        {/* Right: what the staff door is for. */}
        <aside className="auth-value-col">
          <div className="card auth-value">
            <h2>{t('home.section.staff')}</h2>
            <ul>
              <li>
                <span className="auth-value-ico"><Icon name="users" /></span>
                <span><strong>{t('ctl.navUsers')}</strong>{t('ctl.usersPrivacy')}</span>
              </li>
              <li>
                <span className="auth-value-ico"><Icon name="tag" /></span>
                <span><strong>{t('ctl.navCategories')}</strong></span>
              </li>
              <li>
                <span className="auth-value-ico"><Icon name="clipboard" /></span>
                <span><strong>{t('ctl.navTemplates')}</strong></span>
              </li>
              <li>
                <span className="auth-value-ico"><Icon name="megaphone" /></span>
                <span><strong>{t('ctl.navAnnouncements')}</strong></span>
              </li>
            </ul>
            <p className="smallish muted mb-0">{t('ctl.privacyNote')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
