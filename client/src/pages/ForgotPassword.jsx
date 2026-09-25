import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import FormField from '../components/FormField.jsx';
import { useLocale } from '../locale.jsx';

/** Step 1 of recovery: ask for the address, always answer the same way
 *  so nobody can probe who has an account here. */
export default function ForgotPassword() {
  const { t } = useLocale();
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
        <div className="auth-top">
          <Link to="/" className="btn btn-ghost btn-sm auth-back">
            <span aria-hidden="true">←</span> {t('auth.backToSite')}
          </Link>
        </div>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
        </div>

        {sent ? (
          <>
            <h1 className="text-center">{t('auth.forgotTitle')}</h1>
            <p className="muted text-center">
              {t('auth.forgotBody')}
            </p>
            <div className="d-flex justify-content-center gap-2">
              <Link className="btn btn-secondary" to="/login">{t('auth.backToSignIn')}</Link>
              <button type="button" className="btn btn-ghost" onClick={() => setSent(false)}>
                {t('auth.tryAnother')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-center" style={{ marginBottom: 4 }}>{t('auth.resetTitle')}</h1>
            <p className="text-center muted" style={{ marginBottom: 24 }}>
              {t('auth.resetSubtitle')}
            </p>

            <form onSubmit={onSubmit} noValidate>
              {error && (
                <div className="field-error mb-3" role="alert">
                  <span aria-hidden="true">⚠</span>
                  <span>{error}</span>
                </div>
              )}
              <FormField label={t('ui.email')} htmlFor="email">
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
                {busy ? t('ui.sending') : t('auth.sendResetLink')}
              </button>
            </form>

            <p className="smallish text-center mt-4 mb-0">
              <Link to="/login">{t('auth.backToSignIn')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
