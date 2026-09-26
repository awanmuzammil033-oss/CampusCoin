import { useEffect, useRef, useState } from 'react';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useLocale } from '../locale.jsx';
import { CURRENCIES } from '../data/currencies.js';

/**
 * Site-wide currency converter (ADV-1) — the small 💱 button in the navbar.
 *
 * It is here, and not buried on a page, because the question "how much is that
 * in my money?" comes up while looking at something else. The arithmetic is
 * done by the server from a cached rate table (services/fxRates.js), so this
 * component never talks to a rate service itself, and the popover always says
 * where the number came from and how old it is.
 *
 * It is a calculator, not a promise: no rate is written to any record, and a
 * pair the table does not know is refused rather than guessed.
 */
const POPULAR = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'INR', 'BDT', 'TRY', 'CNY', 'JPY'];

const SYMBOL = new Map(CURRENCIES.map((c) => [c.code, c.symbol]));
const NAME = new Map(CURRENCIES.map((c) => [c.code, c.name]));

const format = (value, code) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const decimals = Math.abs(n) < 1 ? 4 : 2;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })} ${code}`;
};

export default function CurrencyConverter({ compact = false }) {
  const { t, language } = useLocale();
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState(null);
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('PKR');
  const [to, setTo] = useState('USD');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);

  // One request per session of the popover, and only when it is opened.
  useEffect(() => {
    if (!open || loaded) return;
    api
      .get('/api/fx/rates')
      .then((data) => {
        setTable(data);
        setLoaded(true);
      })
      .catch(() => {
        setError(t('conv.error'));
        setLoaded(true);
      });
  }, [open, loaded, t]);

  // The result is the server's answer, not arithmetic done in the browser.
  useEffect(() => {
    if (!open || !table) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || from === to) {
      setResult(null);
      return;
    }
    let alive = true;
    api
      .get(`/api/fx/convert?amount=${encodeURIComponent(amount)}&from=${from}&to=${to}`)
      .then((data) => alive && setResult(data))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [amount, from, to, open, table]);

  // Click outside and Escape close it, like every other menu in the chrome.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = table?.rates ? Object.keys(table.rates).sort() : POPULAR;
  const referenceOnly = new Set(table?.referenceOnly || []);

  return (
    <div className="cc-converter" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('conv.title')}
        title={t('conv.title')}
      >
        <Icon name="exchange" />
        {!compact && <span className="cc-converter-label">{t('topbar.converter')}</span>}
      </button>

      {open && (
        <div className="cc-popover cc-converter-popover" role="dialog" aria-label={t('conv.title')}>
          <div className="cc-popover-head">
            <strong>{t('conv.title')}</strong>
            {table?.asOf && (
              <span className="pill pill-sm">
                {t('conv.updated', {
                  when: new Date(table.asOf).toLocaleDateString(language || 'en', { day: '2-digit', month: 'short', year: 'numeric' }),
                })}
              </span>
            )}
          </div>

          <div className="cc-converter-body">
            <label className="visually-hidden" htmlFor="conv-amount">{t('conv.amount')}</label>
            <input
              id="conv-amount"
              className="input num"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
            />

            <div className="cc-converter-pair">
              <label className="cc-converter-side">
                <span>{t('conv.from')}</span>
                <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {list.map((code) => (
                    <option key={code} value={code}>
                      {code} {SYMBOL.get(code) || ''}
                      {referenceOnly.has(code) ? ` · ${t('conv.referenceMark')}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn btn-ghost cc-converter-swap"
                onClick={() => { setFrom(to); setTo(from); }}
                aria-label={t('conv.swap')}
                title={t('conv.swap')}
              >
                <Icon name="swap" />
              </button>

              <label className="cc-converter-side">
                <span>{t('conv.to')}</span>
                <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                  {list.map((code) => (
                    <option key={code} value={code}>
                      {code} {SYMBOL.get(code) || ''}
                      {referenceOnly.has(code) ? ` · ${t('conv.referenceMark')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* a select can only show one line, and these names do not fit in
                one - so the menu carries the code and the words go here */}
            <p className="cc-converter-names smallish muted">
              {NAME.get(from) || from} <Icon name="arrowRight" size={13} /> {NAME.get(to) || to}
            </p>

            <div className="cc-converter-result" data-testid="conv-result">
              {from === to ? (
                <span className="muted smallish">{t('conv.same')}</span>
              ) : result ? (
                <>
                  <strong className="num">{format(result.result, to)}</strong>
                  <span className="smallish muted">
                    {t('conv.rateLine', { from, rate: result.rate.toLocaleString(), to })}
                  </span>
                </>
              ) : (
                <span className="muted smallish">{t('conv.error')}</span>
              )}
            </div>

            {table?.source === 'reference' && (
              <p className="cc-converter-note smallish">
                <Icon name="info" size={14} /> {t('conv.offline')}
              </p>
            )}
            {table?.source !== 'reference' && referenceOnly.size > 0 && (
              <p className="cc-converter-hint smallish muted">
                <Icon name="info" size={14} /> {t('conv.mixedNote')}
              </p>
            )}
            {error && !result && (
              <p className="cc-converter-note smallish">
                <Icon name="warning" size={14} /> {error}
              </p>
            )}
            <p className="cc-converter-hint smallish muted">{t('conv.hint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
