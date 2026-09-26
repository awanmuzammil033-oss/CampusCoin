import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';

/**
 * Survival mode card (SURV-1).
 *
 * When the month is running out, a student needs one number and the working
 * behind it — not another chart. This card shows the strict daily allowance,
 * exactly how it was arrived at (balance, bills still to come, money already on
 * its way, days left) and, underneath, the one thing that makes a strict
 * number stick: how fast they have actually been spending.
 *
 * It stays out of the way until it is worth looking at: with the mode off it
 * only appears in the last third of the month, or when the committed bills
 * already exceed the balance — the two moments where the number is news.
 */
export default function SurvivalCard() {
  const { t } = useLocale();
  const { push } = useToast();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/survival')
      .then((res) => {
        if (alive) setPlan(res.plan);
      })
      .catch(() => {
        /* the dashboard is still perfectly usable without this card */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle() {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const res = await api.patch('/api/survival', { enabled: !plan.enabled });
      setPlan(res.plan);
      push(res.plan.enabled ? t('surv.onToast') : t('surv.offToast'), 'success');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!plan) return null;

  const late = plan.daysLeft <= 10;
  if (!plan.enabled && !late && !plan.tight) return null;

  // advice lines are keys from the server; the sentences live in the dictionary
  // so they arrive in the language the student is reading
  const advice = (plan.advice || []).map((line) => {
    switch (line.key) {
      case 'short':
        return { tone: 'high', text: t('surv.short', { amount: money(line.amount) }) };
      case 'nothing-left':
        return { tone: 'high', text: t('surv.nothingLeft') };
      case 'daily':
        return { tone: 'ok', text: t('surv.dailyLine', { amount: money(line.amount) }) };
      case 'slower':
        return { tone: 'warn', text: t('surv.slower', { current: money(line.current), target: money(line.target) }) };
      case 'holding':
        return { tone: 'ok', text: t('surv.holding', { current: money(line.current), target: money(line.target) }) };
      case 'committed':
        return { tone: 'info', text: t('surv.committedLine', { count: line.count }) };
      case 'negative':
        return { tone: 'high', text: t('surv.negative') };
      default:
        return null;
    }
  }).filter(Boolean);

  return (
    <section
      className={`card survival-card${plan.enabled ? ' survival-card-on' : ''}${plan.tight ? ' survival-card-tight' : ''}`}
      aria-labelledby="survival-title"
    >
      <div className="card-title">
        <span id="survival-title">
          <Icon name="hourglass" /> {t('surv.title')}
        </span>
        <label className="cc-switch" htmlFor="surv-toggle">
          <input
            id="surv-toggle"
            type="checkbox"
            checked={plan.enabled}
            disabled={busy}
            onChange={toggle}
          />
          <span className="cc-switch-track" aria-hidden="true" />
          <span className="cc-switch-label">{plan.enabled ? t('surv.on') : t('surv.off')}</span>
        </label>
      </div>

      {plan.enabled ? (
        <>
          <div className="survival-number num">{money(plan.dailyBudget)}</div>
          <p className="smallish muted mb-0">{t('surv.perDay', { days: plan.daysLeft })}</p>

          {/* the working, so the number can be trusted and questioned */}
          <dl className="survival-math mt-3">
            <div>
              <dt>{t('surv.balance')}</dt>
              <dd className="num">{money(plan.balance)}</dd>
            </div>
            {plan.expectedIncome > 0 && (
              <div>
                <dt>{t('surv.incoming')}</dt>
                <dd className="num amount-income">+ {money(plan.expectedIncome)}</dd>
              </div>
            )}
            <div>
              <dt>{t('surv.billsDue')}</dt>
              <dd className="num amount-expense">− {money(plan.committedTotal)}</dd>
            </div>
            <div className="survival-math-total">
              <dt>{t('surv.freeToSpend')}</dt>
              <dd className="num">{money(plan.freeMoney)}</dd>
            </div>
          </dl>

          {plan.committedLines?.length > 0 && (
            <ul className="survival-bills mt-3">
              {plan.committedLines.map((line) => (
                <li key={line.id}>
                  <span className="survival-bill-name">
                    {line.title || t('surv.recurringBill')}
                    {line.occurrences > 1 && (
                      <span className="smallish muted"> ×{line.occurrences}</span>
                    )}
                  </span>
                  <span className={`num ${line.kind === 'income' ? 'amount-income' : 'amount-expense'}`}>
                    {line.kind === 'income' ? '+' : '−'} {money(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ul className="survival-advice mt-3">
            {advice.map((line, i) => (
              <li key={i} className={`survival-advice-${line.tone}`}>
                <Icon name={line.tone === 'ok' ? 'checkCircle' : line.tone === 'info' ? 'info' : 'warning'} size={15} />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>

          <div className="d-flex gap-2 mt-3 flex-wrap">
            <Link className="btn btn-ghost btn-sm" to="/recurring">
              <Icon name="history" size={15} /> {t('surv.manageBills')}
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/transactions/new">
              <Icon name="plus" size={15} /> {t('surv.logEntry')}
            </Link>
          </div>
        </>
      ) : (
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <p className="flex-grow-1 smallish muted mb-0">
            {plan.tight
              ? t('surv.offTight', { days: plan.daysLeft })
              : t('surv.offHint', { days: plan.daysLeft, amount: money(plan.balance) })}
          </p>
          <button className="btn btn-primary btn-sm" type="button" onClick={toggle} disabled={busy}>
            <Icon name="hourglass" size={15} /> {t('surv.turnOn')}
          </button>
        </div>
      )}
    </section>
  );
}
