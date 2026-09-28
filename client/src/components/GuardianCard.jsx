import { useCallback, useEffect, useRef, useState } from 'react';

import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import Progress from './Progress.jsx';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';
import { api } from '../api.js';
import { monthLabel, uiLang } from '../dates.js';

/**
 * The student's half of the guardian summary (NEW-8) — one card in settings.
 *
 * Four things happen here, in this order, and the order is the feature:
 * an address, the sentence saying what the guardian will and will not see, the
 * preview of exactly that, and only then the link. The tick is required before
 * the button does anything, and the server refuses without it as well — the
 * checkbox is not a decoration on a form, it is the permission.
 *
 * `SummaryBody` is exported and is what pages/GuardianViewPage.jsx renders the
 * guardian's page with. One renderer for the preview and the real thing, on top
 * of one server function, so "what I agreed to" and "what they were shown"
 * cannot be two different documents.
 *
 * EVERY string here is a key. Including the sentences the server refuses with:
 * the API answers `{ error: <code>, message: <key> }` and a refusal is rendered
 * with `t(err.message)`, which degrades to showing the message unchanged if a
 * key is ever missing rather than to showing a raw slug.
 */

/* ------------------------------ shared bits -------------------------------- */

/**
 * Money in the currency the figures are actually denominated in — never the
 * reader's own. `money()` in money.js converts into whatever the person looking
 * at the screen has chosen, which is exactly right for the student and exactly
 * wrong for a guardian reading a summary of somebody else's ledger.
 */
export function amount(value, currency) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency || 'USD'} ${safe.toFixed(2)}`;
  }
}

/** "September 2026" from a "2026-09" month key, in the reader's language. */
export function monthOf(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return '';
  return monthLabel(new Date(Date.UTC(y, m - 1, 1)));
}

/** A consent date, for the student's own card only. */
function stamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(uiLang(), { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The summary itself — three sections, and nothing else. Used by the preview and
 * by the guardian's page without a prop to tell them apart, because the one
 * thing this feature must never do is show two different things.
 */
export function SummaryBody({ summary }) {
  const { t } = useLocale();
  if (!summary) return null;

  const month = monthOf(summary.month);
  const name = summary.studentName;
  const money = (v) => amount(v, summary.currency);
  const { savings } = summary;

  return (
    <div className="cc-guard-summary">
      {/* The month is the line that matters most to a reader, so it is the one
          the stylesheet sets largest; the name follows it quietly. */}
      <div className="cc-guard-head">
        <h2>{t('guard.summary.heading')}</h2>
        <p className="cc-guard-month">{month}</p>
        <p className="cc-guard-name">{t('guard.summary.forWhom', { name })}</p>
      </div>
      <p className="smallish muted mb-0">{t('guard.summary.currency', { currency: summary.currency })}</p>

      {/* Two honest lines, before any number. The first says the month is a
          fixed snapshot; the second says this is not the whole picture and who
          to ask. Between them they stop three totals being read as a verdict. */}
      <p className="cc-guard-note smallish">{t('guard.summary.frozen', { month })}</p>
      <p className="cc-guard-note smallish">{t('guard.summary.disclaimer', { name })}</p>

      <section className="cc-guard-section">
        <h3 className="cc-guard-sectionTitle">{t('guard.section.categories')}</h3>
        <p className="smallish muted">{t('guard.section.categoriesNote')}</p>
        {summary.categories.length ? (
          <table className="table">
            <caption className="sr-only">{t('guard.section.categories')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('guard.category.col')}</th>
                <th scope="col" className="text-end">{t('guard.category.colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.categories.map((row) => (
                <tr key={row.category}>
                  <th scope="row" style={{ fontWeight: 500 }}>{row.category}</th>
                  <td className="text-end num">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="smallish muted mb-0">{t('guard.empty.categories')}</p>
        )}
      </section>

      <section className="cc-guard-section">
        <h3 className="cc-guard-sectionTitle">{t('guard.section.budgets')}</h3>
        <p className="smallish muted">{t('guard.section.budgetsNote')}</p>
        {summary.budgets.length ? (
          <div className="d-grid gap-3">
            {summary.budgets.map((row) => (
              <div className="cc-guard-meter" key={row.category}>
                <Progress pct={row.pct} label={row.category} />
              </div>
            ))}
          </div>
        ) : (
          <p className="smallish muted mb-0">{t('guard.empty.budgets')}</p>
        )}
      </section>

      <section className="cc-guard-section cc-guard-save">
        <h3 className="cc-guard-sectionTitle">{t('guard.section.savings')}</h3>
        {/*
          The goal is the student's own and "saved" is the same figure the
          dashboard's goal card measures. With no goal, or with a month that
          came out negative, the page SAYS SO instead of printing a bar at 0% —
          an invented metric would be the one genuinely dishonest thing here.
        */}
        {savings.state === 'no-goal' && (
          <p className="cc-guard-state smallish mb-0">{t('guard.savings.noGoal')}</p>
        )}
        {savings.state === 'nothing-saved' && (
          <p className="cc-guard-state smallish mb-0">{t('guard.savings.nothingSaved')}</p>
        )}
        {(savings.state === 'short' || savings.state === 'met') && (
          <>
            <div className="cc-guard-meter">
              <Progress pct={savings.pct} label={t('guard.savings.barLabel')} variant="goal" />
            </div>
            <p className="cc-guard-state smallish mb-0">
              {savings.state === 'met'
                ? t('guard.savings.met', { goal: money(savings.goal), saved: money(savings.saved) })
                : t('guard.savings.short', { goal: money(savings.goal), saved: money(savings.saved) })}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------- the card ---------------------------------- */

export default function GuardianCard() {
  const { t } = useLocale();
  const { push } = useToast();
  const linkRef = useRef(null);

  const [state, setState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [issued, setIssued] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [current, prev] = await Promise.all([
        api.get('/api/guardian/link'),
        api.get('/api/guardian/preview'),
      ]);
      setState(current);
      setPreview(prev.summary);
      setEmail((value) => value || current.email || '');
      // The tick starts where the stored consent is, so the card shows what the
      // account actually holds rather than what the student last clicked.
      setConsent(Boolean(current.consentedAt));
    } catch (err) {
      push(t(err.message), 'error');
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function issue() {
    setBusy(true);
    try {
      const res = await api.post('/api/guardian/link', { email, consent });
      setIssued({ url: res.url, month: res.month, expiresAt: res.expiresAt });
      setState(res.state);
      push(t('guard.toast.issued'), 'success');
    } catch (err) {
      // err.message is a dictionary key for every refusal this feature makes
      push(t(err.message), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const next = await api.del('/api/guardian/link');
      setState(next);
      setIssued(null);
      setConsent(false);
      setAsking(false);
      push(t('guard.toast.revoked'), 'success');
    } catch (err) {
      push(t(err.message), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      push(t('guard.issued.copied'), 'success');
    } catch {
      // A clipboard the browser will not open is not an error worth shouting
      // about: the field is right there and one tap selects all of it.
      linkRef.current?.select();
    }
  }

  const configured = Boolean(state?.configured);

  return (
    <section className="card cc-guard-card">
      <div className="card-title">
        <span>{t('guard.card.title')}</span>
      </div>
      <p className="smallish muted">{t('guard.card.subtitle')}</p>

      {loading ? (
        <p className="smallish muted mb-0">
          <span className="spinner" aria-hidden="true" /> {t('guard.card.loading')}
        </p>
      ) : (
        <>
          <p className="cc-guard-status smallish">
            <Icon name={configured ? 'shield' : 'user'} size={15} />{' '}
            {configured
              ? t('guard.card.statusOn', { email: state.email, when: stamp(state.consentedAt) })
              : t('guard.card.statusNone')}
          </p>

          <FormField label={t('guard.card.emailLabel')} htmlFor="guard-email" help={t('guard.card.emailHelp')}>
            {(aria) => (
              <input
                id="guard-email"
                className="input"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                {...aria}
              />
            )}
          </FormField>

          {/*
            The consent sentence comes BEFORE the tick, not after it, and it
            names both halves: what the guardian will see, and what they will
            not. One key, one sentence, and it is the only place in the app that
            says what a guardian link discloses.
          */}
          <div className="cc-guard-consent">
            <p className="smallish mb-2">{t('guard.consent.line')}</p>
            <label className="cc-switch" htmlFor="guard-consent">
              <input
                id="guard-consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="cc-switch-track" aria-hidden="true" />
              <span className="cc-switch-label">{t('guard.consent.tick')}</span>
            </label>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-primary" onClick={issue} disabled={busy || !consent}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {t(configured ? 'guard.issue.buttonAgain' : 'guard.issue.button')}
            </button>
            {configured && !asking && (
              <button type="button" className="btn btn-danger-outline" onClick={() => setAsking(true)} disabled={busy}>
                {t('guard.revoke.ask')}
              </button>
            )}
            {configured && asking && (
              <button type="button" className="btn btn-danger-outline" onClick={revoke} disabled={busy}>
                {t('guard.revoke.confirm')}
              </button>
            )}
          </div>
          {!consent && <p className="field-help">{t('guard.consent.blocked')}</p>}
          {asking && <p className="field-help mb-0">{t('guard.revoke.help')}</p>}

          {issued && (
            <div className="cc-guard-issued">
              <h3 className="cc-guard-sectionTitle">{t('guard.issued.title')}</h3>
              <p className="smallish muted">{t('guard.issued.once')}</p>
              <FormField label={t('guard.issued.linkLabel')} htmlFor="guard-link">
                {(aria) => (
                  <input id="guard-link" ref={linkRef} className="input cc-guard-link" type="text" readOnly value={issued.url} {...aria} />
                )}
              </FormField>
              {/* The button sits under the field rather than beside it: 43
                  characters of token on a phone has to be readable, and
                  selectable, without being squeezed. */}
              <button type="button" className="btn btn-secondary" onClick={copyLink}>
                <Icon name="copy" size={15} /> {t('guard.issued.copy')}
              </button>
              <p className="field-help">{t('guard.issued.month', { month: monthOf(issued.month) })}</p>
            </div>
          )}

          {preview && (
            <div className="cc-guard-preview">
              <h3 className="cc-guard-sectionTitle">{t('guard.preview.label')}</h3>
              <SummaryBody summary={preview} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
