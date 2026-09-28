import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import AuthArt from '../components/art/AuthArt.jsx';
import { useLocale } from '../locale.jsx';

/**
 * Password recovery, in two steps on one screen.
 *
 * Step 1 asks for the RECOVERY address — the private one the student chose at
 * sign-up, not the address they sign in with. That distinction is the whole
 * security story: a sign-in address is the one that shows up in screenshots and
 * on shared machines, so anyone who can type it must not be able to change the
 * password. If somebody types it here, nothing happens.
 *
 * Step 2 takes the six-digit code and the new password. The code is emailed to
 * the recovery inbox; with no mail server configured (development, and this
 * project's own demo) the server hands it back with the response and the page
 * shows it, so the flow can be finished and shown without a mail account.
 */
export default function ForgotPassword({ embedded = false, onClose, onSwitch } = {}) {
  const { t } = useLocale();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [step, setStep] = useState('ask'); // 'ask' | 'code' | 'done'
  const [devCode, setDevCode] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  async function requestCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/api/auth/password-reset/request', { email });
      setDevCode(res.devCode || '');
      setUnknown(res.devHint === 'unknown-recovery-email');
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/password-reset/confirm', { email, code, password });
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`auth-wrap${host.wrapper}`}>
      <div className="auth-split">
        {/* Left: the picture, hidden below 1000px so the form owns a phone. */}
        <aside className="auth-art-col">
          <AuthArt variant="reset" />
          <div className="auth-art-copy">
            <h2>{t('reset.artTitle')}</h2>
            <p>{t('reset.artBody')}</p>
            <ul className="auth-points">
              <li><Icon name="lock" /> {t('reset.pointOwn')}</li>
              <li><Icon name="hourglass" /> {t('reset.pointShort')}</li>
              <li><Icon name="unlock" /> {t('reset.pointOnce')}</li>
            </ul>
          </div>
        </aside>

        <div className="card auth-card">
          <div className="auth-top">{host.back}</div>
          <div className="auth-brand">
            <span className="brand-mark" aria-hidden="true">C</span>
          </div>

          {step === 'ask' && (
            <>
              <h1 className="text-center" style={{ marginBottom: 4 }}>{t('auth.resetTitle')}</h1>
              <p className="text-center muted" style={{ marginBottom: 22 }}>
                {t('reset.askSubtitle')}
              </p>

              <form onSubmit={requestCode} noValidate>
                {error && (
                  <div className="field-error mb-3" role="alert">
                    <Icon name="warning" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <FormField label={t('reset.recoveryEmail')} htmlFor="email" help={t('reset.recoveryHelp')}>
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

                <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                  {busy && <span className="spinner" aria-hidden="true" />}
                  {busy ? t('ui.sending') : t('reset.sendCode')}
                </button>
              </form>

              <p className="smallish text-center mt-4 mb-0">
                {host.switchTo('/login', t('auth.backToSignIn'))}
              </p>
            </>
          )}

          {step === 'code' && (
            <>
              <h1 className="text-center" style={{ marginBottom: 4 }}>{t('reset.codeTitle')}</h1>
              <p className="text-center muted" style={{ marginBottom: 20 }}>
                {t('reset.codeSubtitle', { email })}
              </p>

              {/* development only: the console mailer delivers nothing, so the
                  code is shown here rather than lost. With SMTP configured this
                  whole block is absent. */}
              {devCode && (
                <div className="reset-dev-code" role="status">
                  <span className="smallish">{t('reset.devCodeLabel')}</span>
                  <strong className="num">{devCode}</strong>
                  <span className="smallish muted">{t('reset.devCodeNote')}</span>
                </div>
              )}
              {unknown && (
                <div className="field-error mb-3" role="alert">
                  <Icon name="warning" size={16} />
                  <span>{t('reset.unknownAddress')}</span>
                </div>
              )}

              <form onSubmit={confirmReset} noValidate>
                {error && (
                  <div className="field-error mb-3" role="alert">
                    <Icon name="warning" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <FormField label={t('reset.code')} htmlFor="code" help={t('reset.codeHelp')}>
                  {(a) => (
                    <input
                      id="code"
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="input reset-code-input num"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      {...a}
                    />
                  )}
                </FormField>

                <FormField label={t('reset.newPassword')} htmlFor="new-password" help={t('reset.passwordHelp')}>
                  {(a) => (
                    <div className="position-relative">
                      <input
                        id="new-password"
                        name="new-password"
                        type={showPassword ? 'text' : 'password'}
                        className="input"
                        autoComplete="new-password"
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
                        aria-label={showPassword ? t('auth.hide') : t('auth.show')}
                        aria-pressed={showPassword}
                      >
                        <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                      </button>
                    </div>
                  )}
                </FormField>

                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary flex-grow-1" disabled={busy || code.length < 6}>
                    {busy && <span className="spinner" aria-hidden="true" />}
                    {busy ? t('ui.saving') : t('reset.setPassword')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setStep('ask');
                      setCode('');
                      setPassword('');
                      setError('');
                      setUnknown(false);
                    }}
                  >
                    {t('auth.tryAnother')}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'done' && (
            <>
              <h1 className="text-center" style={{ marginBottom: 4 }}>{t('reset.doneTitle')}</h1>
              <p className="muted text-center">{t('reset.doneBody')}</p>
              <div className="d-flex justify-content-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (embedded && onSwitch) onSwitch('/login');
                    else navigate('/?panel=login');
                  }}
                >
                  {t('auth.backToSignIn')}
                </button>
                <Link className="btn btn-ghost" to="/profile">
                  {t('reset.keepSafe')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
