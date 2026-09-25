import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import { useLocale } from '../locale.jsx';

/** Step 3: the emailed token lands here in the URL. The server checks it is
 *  unexpired and unused before accepting the new password. */
export default function ResetPassword() {
  const { t } = useLocale();
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

    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    if (password.length < 8) return setError(t('auth.passwordTooShort'));

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
        <div className="auth-top">
          <Link to="/" className="btn btn-ghost btn-sm auth-back">
            <Icon name="arrowLeft" size={15} /> {t('auth.backToSite')}
          </Link>
        </div>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>

        {done ? (
          <>
            <h1 className="text-center">{t('auth.updatedTitle')}</h1>
            <p className="muted text-center">
              {t('auth.updatedBody')}
            </p>
            <Link className="btn btn-primary w-100" to="/login">{t('auth.goToSignIn')}</Link>
          </>
        ) : (
          <>
            <h1 className="text-center" style={{ marginBottom: 4 }}>{t('auth.chooseNewPw')}</h1>
            <p className="text-center muted" style={{ marginBottom: 24 }}>
              {t('auth.chooseNewPwBody')}
            </p>

            <form onSubmit={onSubmit} noValidate>
              {error && (
                <div className="field-error mb-3" role="alert">
                  <Icon name="warning" size={16} />
                  <span>{error}</span>
                </div>
              )}
              <FormField label={t('auth.newPassword')} htmlFor="password" help={t('auth.newPwHelp')}>
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
              <FormField label={t('auth.confirmNewPw')} htmlFor="confirm">
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
                {busy ? t('ui.saving') : t('auth.saveNewPw')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
