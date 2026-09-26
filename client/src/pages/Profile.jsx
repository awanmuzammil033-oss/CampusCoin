import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Page from '../components/Page.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { api } from '../api.js';
import { ledgerCurrencySymbol } from '../money.js';
import { CURRENCIES } from '../data/currencies.js';
import { FX_AS_OF } from '../data/fx.js';

const YEARS = ['1st year', '2nd year', '3rd year', '4th year'];

/** Money columns arrive as Decimal128 objects — read them the friendly way. */
function plainMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return value.$numberDecimal ?? value.value ?? '';
  return String(value);
}

export default function Profile() {
  const { user, updatePreferences, updateProfile, logout, refresh } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { t, currency, ledgerCurrency, setLedgerCurrency } = useLocale();

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
  const [survivalBusy, setSurvivalBusy] = useState(false);

  /**
   * Survival mode is a switch on the account, but the plan it produces lives
   * on the dashboard. Flipping it here therefore has to refresh the session
   * too, or the header and profile would keep showing the old value.
   */
  async function toggleSurvival() {
    const next = !user?.survivalMode?.enabled;
    setSurvivalBusy(true);
    try {
      await api.patch('/api/survival', { enabled: next });
      await refresh(); // the flag lives on the account, so the session copy must catch up
      push(next ? t('surv.onToast') : t('surv.offToast'), 'success');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSurvivalBusy(false);
    }
  }

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
      push(t('prof.saved'));
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
    <Page trail={[{ label: t('nav.profile') }]} title={t('nav.profile')} subtitle={t('prof.subtitle')}>
      <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="card">
          <div className="card-title">
            <span>{t('prof.detailsTitle')}</span>
          </div>

          <form onSubmit={saveDetails} noValidate>
            {error && (
              <div className="field-error mb-3" role="alert">
                <Icon name="warning" />
                <span>{error}</span>
              </div>
            )}

            <FormField label={t('ui.name')} htmlFor="profile-name">
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

            <FormField label={t('ui.email')} htmlFor="profile-email" help={t('prof.emailHelp')}>
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

            <FormField label={t('prof.academicYear')} htmlFor="profile-year">
              {(a) => (
                <select
                  id="profile-year"
                  className="input"
                  value={form.academicYear}
                  onChange={(e) => setField('academicYear', e.target.value)}
                  {...a}
                >
                  <option value="">{t('prof.notSet')}</option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {t(`prof.year.${year.replace(' ', '-')}`)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={t('prof.allowanceLabel')} htmlFor="profile-allowance" help={t('prof.allowanceHelp')}>
              <div className="amount-wrap">
<span className="amount-prefix" aria-hidden="true">{ledgerCurrencySymbol()}</span>
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

            <FormField label={t('prof.goalLabel')} htmlFor="profile-goal" help={t('prof.goalHelp')}>
              <div className="amount-wrap">
<span className="amount-prefix" aria-hidden="true">{ledgerCurrencySymbol()}</span>
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
              {busy ? t('ui.saving') : t('prof.saveDetails')}
            </button>
          </form>
        </section>

        <div className="d-grid gap-3" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-title">
              <span>{t('prof.appearance')}</span>
            </div>

            <div className="field">
              <span id="theme-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                {t('prof.theme')}
              </span>
              <div className="chip-grid" role="group" aria-labelledby="theme-label">
                <button type="button" className="chip" aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}>
                  <Icon name="sun" size={16} /> {t('prof.lightChip')}
                </button>
                <button type="button" className="chip" aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}>
                  <Icon name="moon" size={16} /> {t('prof.darkChip')}
                </button>
              </div>
            </div>

            <div className="field mb-0">
              <span id="size-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                {t('prof.textSize')}
              </span>
              <div className="d-flex align-items-center gap-2" role="group" aria-labelledby="size-label">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => changeSize(-1)}
                  disabled={fontScale <= 1}
                  aria-label={t('prof.decrease')}
                  title={t('prof.smaller')}
                >
                  <Icon name="fontSize" />
                  <Icon name="minus" />
                </button>
                <span className="num smallish" aria-live="polite">{t('prof.size', { n: fontScale })}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => changeSize(1)}
                  disabled={fontScale >= 4}
                  aria-label={t('prof.increase')}
                  title={t('prof.larger')}
                >
                  <Icon name="fontSize" />
                  <Icon name="plus" />
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <span>{t('prof.currencySection')}</span>
            </div>
            <div className="field mb-0">
              <label htmlFor="profile-ledger-currency" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                {t('prof.ledgerCurrency')}
              </label>
              <select
                id="profile-ledger-currency"
                className="input"
                value={ledgerCurrency}
                onChange={(e) => setLedgerCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="field-help">{t('prof.ledgerHelp')}</p>
              <p className="field-help">
                {ledgerCurrency === currency
                  ? t('prof.ledgerSame', { code: ledgerCurrency })
                  : t('prof.ledgerConverted', { code: ledgerCurrency, show: currency, date: FX_AS_OF })}
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <span>{t('surv.title')}</span>
            </div>
            <p className="smallish muted">{t('prof.survivalBody')}</p>
            <label className="cc-switch" htmlFor="profile-survival">
              <input
                id="profile-survival"
                type="checkbox"
                checked={Boolean(user?.survivalMode?.enabled)}
                disabled={survivalBusy}
                onChange={toggleSurvival}
              />
              <span className="cc-switch-track" aria-hidden="true" />
              <span className="cc-switch-label">
                {user?.survivalMode?.enabled ? t('surv.on') : t('surv.off')}
              </span>
            </label>
            <p className="field-help mb-0">
              <Link to="/dashboard">{t('surv.seeItOnDashboard')}</Link>
            </p>
          </section>

          <section className="card">
            <div className="card-title">
              <span>{t('prof.security')}</span>
            </div>
            <p className="smallish muted">
              {t('prof.securityBody')}
            </p>
            <div className="d-flex gap-2 flex-wrap">
              <Link className="btn btn-secondary btn-sm" to="/forgot-password">
                {t('prof.changePassword')}
              </Link>
              <button type="button" className="btn btn-danger-outline btn-sm" onClick={signOut} disabled={signingOut}>
                {signingOut && <span className="spinner" aria-hidden="true" />}
                {signingOut ? t('prof.signingOut') : t('prof.signOut')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}
