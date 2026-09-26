import { useEffect, useRef, useState } from 'react';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';
import { convert, money } from '../money.js';
import { CURRENCIES } from '../data/currencies.js';

/**
 * The currency drawer.
 *
 * The trigger lives on the dashboard's balance card, in the space the card
 * already had spare, and opens a panel that slides in from the right. Three
 * things it does that a converter widget usually does not:
 *
 *  - it starts from the number the student actually has in front of them. The
 *    amount is pre-filled with this month's balance **as displayed**, and the
 *    "From" currency starts as the currency they are already looking at, so the
 *    first thing on screen is a real question ("what is my balance in PKR?")
 *    rather than an empty form.
 *  - the arithmetic is the server's. This component never multiplies two rates
 *    itself: it asks `/api/fx/convert`, which answers from a cached table and
 *    refuses a pair it cannot honestly price. That is also why a blank amount
 *    shows nothing at all rather than a confident zero.
 *  - "Apply to Entire Website" is not a promise about a future. It changes the
 *    display currency the whole app reads, so every balance, income figure,
 *    chart and report re-renders in that currency - and nothing stored changes.
 *    The one thing it will not do is quietly move the student's *ledger*
 *    currency: their amounts are in the ledger's money, and a display choice
 *    must never rewrite that.
 */

const SYMBOL = new Map(CURRENCIES.map((c) => [c.code, c.symbol]));
const NAME = new Map(CURRENCIES.map((c) => [c.code, c.name]));

/** A sensible second currency to offer: the ledger's when it differs, else EUR. */
function defaultTarget(from, ledger) {
  if (ledger && ledger !== from) return ledger;
  return from === 'EUR' ? 'GBP' : 'EUR';
}

export function CurrencyTrigger({ onOpen, balance, currency }) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      className="cc-conv-trigger"
      onClick={onOpen}
      aria-label={t('conv.title')}
      title={t('conv.title')}
    >
      <span className="cc-conv-trigger-ico" aria-hidden="true">
        <Icon name="exchange" size={18} />
      </span>
      <span className="cc-conv-trigger-text">
        <span className="cc-conv-trigger-title">{t('conv.convertShort')}</span>
        <span className="cc-conv-trigger-sub num">
          {t('conv.ofYour', { amount: balance, currency })}
        </span>
      </span>
    </button>
  );
}

export default function CurrencyDrawer({ open, onClose, balance }) {
  const { t, language, currency, ledgerCurrency, setCurrency } = useLocale();
  const toast = useToast();

  // `balance` arrives already converted into the display currency, so the
  // drawer opens on the figure the student can see on the card behind it.
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(currency);
  const [to, setTo] = useState(() => defaultTarget(currency, ledgerCurrency));
  const [table, setTable] = useState(null);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState('');
  const [applied, setApplied] = useState(false);
  const panelRef = useRef(null);
  const amountRef = useRef(null);

  /*
   * Opening the drawer fills in the figure the card is showing and asks for
   * the rate table once. It happens on the false -> true edge ONLY.
   *
   * The dependency list has to include `currency`, because the pre-filled
   * amount is the balance AS DISPLAYED - but running the body of the effect on
   * every currency change would wipe the confirmation line the moment the
   * student pressed "Apply", and refill the amount and the pair under their
   * hands. So the values are read here, and the work is done once.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setAmount((convert(balance ?? 0) || 0).toFixed(2));
      setFrom(currency);
      setTo(defaultTarget(currency, ledgerCurrency));
      setResult(null);
      setProblem('');
      setApplied(false);
      api
        .get('/api/fx/rates')
        .then(setTable)
        .catch(() => setTable(null));
    }
    wasOpen.current = open;
  }, [open, balance, currency, ledgerCurrency]);

  /* the result is the server's answer, debounced so typing does not spam it */
  useEffect(() => {
    if (!open) return undefined;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || from === to) {
      setResult(null);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .get(`/api/fx/convert?amount=${encodeURIComponent(amount)}&from=${from}&to=${to}`)
        .then((data) => {
          if (!alive) return;
          setResult(data);
          setProblem('');
        })
        .catch((err) => {
          if (!alive) return;
          setResult(null);
          setProblem(err.message);
        });
    }, 320);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [amount, from, to, open]);

  /* Escape closes, and the page behind must not scroll while it is open. */
  /* `onClose` is a new function on every render of the dashboard, so this */
  /* effect re-runs often; the value it has to put back is therefore */
  /* captured ONCE, or a second run would capture its own 'hidden' and the */
  /* page could stay locked after the drawer closed. */
  const overflowBefore = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    if (overflowBefore.current === null) {
      overflowBefore.current = document.body.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    amountRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowBefore.current || '';
      overflowBefore.current = null;
    };
  }, [open, onClose]);

  const list = table?.rates ? Object.keys(table.rates).sort() : [];
  const referenceOnly = new Set(table?.referenceOnly || []);
  const samePair = from === to;
  const canApply = Boolean(result) && !samePair && to && to !== currency;

  function apply() {
    if (!canApply) return;
    setCurrency(to);
    setApplied(true);
    toast.push(t('conv.applied', { currency: to }), 'success');
  }

  return (
    <>
      {open && <div className="cc-drawer-backdrop" onClick={onClose} role="presentation" />}

      <aside
        className={`cc-drawer ${open ? 'cc-drawer-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('conv.title')}
        aria-hidden={!open}
        ref={panelRef}
      >
        <div className="cc-drawer-head">
          <div>
            <h2 className="cc-drawer-title mb-0">
              <Icon name="exchange" size={19} /> {t('conv.title')}
            </h2>
            <p className="cc-drawer-sub smallish muted mb-0">{t('conv.drawerSub')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('ui.close')}>
            <Icon name="close" />
          </button>
        </div>

        <div className="cc-drawer-body">
          <label className="cc-drawer-label" htmlFor="conv-drawer-amount">
            {t('conv.amount')}
          </label>
          <input
            id="conv-drawer-amount"
            ref={amountRef}
            className="input num cc-drawer-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="cc-drawer-hint smallish muted">
            <Icon name="info" size={13} /> {t('conv.prefilled', { amount: money(balance) })}
          </p>

          <div className="cc-drawer-pair">
            <label className="cc-drawer-side">
              <span>{t('conv.from')}</span>
              <select className="input" value={from} onChange={(event) => setFrom(event.target.value)}>
                {list.map((code) => (
                  <option key={code} value={code}>
                    {code} {SYMBOL.get(code) || ''}
                    {referenceOnly.has(code) ? ` · ${t('conv.referenceMark')}` : ''}
                  </option>
                ))}
              </select>
              <small className="cc-drawer-code">{NAME.get(from) || from}</small>
            </label>

            <button
              type="button"
              className="btn btn-ghost cc-drawer-swap"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
              aria-label={t('conv.swap')}
              title={t('conv.swap')}
            >
              <Icon name="swap" />
            </button>

            <label className="cc-drawer-side">
              <span>{t('conv.to')}</span>
              <select className="input" value={to} onChange={(event) => setTo(event.target.value)}>
                {list.map((code) => (
                  <option key={code} value={code}>
                    {code} {SYMBOL.get(code) || ''}
                    {referenceOnly.has(code) ? ` · ${t('conv.referenceMark')}` : ''}
                  </option>
                ))}
              </select>
              <small className="cc-drawer-code">{NAME.get(to) || to}</small>
            </label>
          </div>

          <div className="cc-drawer-result" aria-live="polite">
            {samePair ? (
              <span className="muted smallish">{t('conv.same')}</span>
            ) : result ? (
              <>
                <strong className="num">
                  {result.result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {to}
                </strong>
                <span className="smallish muted">
                  {t('conv.rateLine', {
                    from,
                    rate: result.rate.toLocaleString(undefined, { maximumFractionDigits: 4 }),
                    to,
                  })}
                </span>
                <span className="smallish muted">
                  {t('conv.updated', {
                    when: new Date(result.asOf).toLocaleDateString(language || 'en', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }),
                  })}
                </span>
              </>
            ) : (
              <span className="muted smallish">{problem || t('conv.typeAmount')}</span>
            )}
          </div>

          {table?.source === 'reference' && (
            <p className="cc-drawer-note smallish">
              <Icon name="warning" size={14} /> {t('conv.offline')}
            </p>
          )}
          {table?.source !== 'reference' && referenceOnly.size > 0 && (
            <p className="cc-drawer-note smallish muted">
              <Icon name="info" size={14} /> {t('conv.mixedNote')}
            </p>
          )}

          <div className="cc-drawer-apply">
            <button type="button" className="btn btn-primary w-100" onClick={apply} disabled={!canApply}>
              <Icon name="checkCircle" size={16} /> {t('conv.applyAll')}
            </button>
            <p className="cc-drawer-apply-help smallish muted">
              {t('conv.applyAllHelp', { currency: to || '—' })}
            </p>
            {applied && (
              <p className="cc-drawer-applied smallish" role="status">
                <Icon name="check" size={14} /> {t('conv.applied', { currency: to })}
              </p>
            )}
          </div>

          <p className="cc-drawer-foot smallish muted">{t('conv.hint')}</p>
        </div>
      </aside>
    </>
  );
}
