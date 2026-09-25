import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../locale.jsx';
import { CURRENCIES } from '../data/currencies.js';
import { LANGUAGES } from '../data/languages.js';
import dictionaries from '../i18n/index.js';

/** True when the interface actually speaks this language (not just listed). */
function hasUi(code) {
  return Boolean(dictionaries[code] || dictionaries[String(code).split('-')[0]]);
}

/**
 * The currency + language pickers, kept together because they behave
 * identically: a button that toggles a capped, internally scrolling list with
 * a live filter, closed by an outside click, Escape, or a selection. They own
 * their own open state so the same pair can sit in the app topbar and on the
 * public home header. `onOpen` lets the host close its sibling popovers
 * (bell, account menu) — and the outside-click listener below closes these
 * whenever the host opens one of those, so neither side needs deep wiring.
 */
export default function LocalePickers({ onOpen }) {
  const { t, currency, setCurrency, language, setLanguage } = useLocale();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const currencyRef = useRef(null);
  const languageRef = useRef(null);

  // While either picker is open: click outside closes it, Escape closes both.
  useEffect(() => {
    if (!currencyOpen && !languageOpen) return undefined;
    function onDocMouseDown(e) {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) setCurrencyOpen(false);
      if (languageRef.current && !languageRef.current.contains(e.target)) setLanguageOpen(false);
    }
    function onDocKeyDown(e) {
      if (e.key === 'Escape') {
        setCurrencyOpen(false);
        setLanguageOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [currencyOpen, languageOpen]);

  const activeCurrency = CURRENCIES.find((c) => c.code === currency);
  const activeLanguage = LANGUAGES.find((l) => l.code.toLowerCase() === language.toLowerCase());

  // Live filter: case-insensitive substring over code + name (and native for
  // languages) — with 100+ entries, scrolling alone is not enough.
  const currencyQueryTrimmed = currencyQuery.trim().toLowerCase();
  const currencyRows = CURRENCIES.filter(
    (c) =>
      !currencyQueryTrimmed ||
      c.code.toLowerCase().includes(currencyQueryTrimmed) ||
      c.name.toLowerCase().includes(currencyQueryTrimmed)
  );
  const languageQueryTrimmed = languageQuery.trim().toLowerCase();
  const languageRows = LANGUAGES.filter(
    (l) =>
      !languageQueryTrimmed ||
      l.code.toLowerCase().includes(languageQueryTrimmed) ||
      l.name.toLowerCase().includes(languageQueryTrimmed) ||
      l.native.toLowerCase().includes(languageQueryTrimmed)
  );

  function openCurrency() {
    const next = !currencyOpen;
    setCurrencyOpen(next);
    setLanguageOpen(false);
    if (next) {
      setCurrencyQuery('');
      onOpen?.();
    }
  }

  function openLanguage() {
    const next = !languageOpen;
    setLanguageOpen(next);
    setCurrencyOpen(false);
    if (next) {
      setLanguageQuery('');
      onOpen?.();
    }
  }

  return (
    <>
      {/* Currency picker — display preference only, never a conversion. */}
      <div className="position-relative" ref={currencyRef}>
        <button type="button" className="icon-btn" aria-label={t('picker.currency')} aria-expanded={currencyOpen} onClick={openCurrency}>
          <span aria-hidden="true">{activeCurrency?.symbol || currency}</span>
          <span className="picker-code">{currency}</span>
        </button>
        {currencyOpen && (
          <div className="dropdown-menu" role="group" aria-label={t('picker.currency')}>
            <input
              className="input menu-search"
              type="search"
              value={currencyQuery}
              onChange={(e) => setCurrencyQuery(e.target.value)}
              placeholder={t('picker.searchCurrency')}
              aria-label={t('picker.searchCurrency')}
              autoFocus
            />
            {currencyRows.length === 0 && <p className="menu-empty">{t('picker.noMatch')}</p>}
            {currencyRows.map((c) => (
              <button
                key={c.code}
                type="button"
                className="dropdown-row"
                aria-pressed={c.code === currency}
                onClick={() => {
                  setCurrency(c.code);
                  setCurrencyOpen(false);
                }}
              >
                <span aria-hidden="true">{c.symbol}</span>
                <strong>{c.code}</strong>
                <span className="row-name">{c.name}</span>
                {c.code === currency && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Language picker — switches chrome text via the dictionaries. */}
      <div className="position-relative" ref={languageRef}>
        <button type="button" className="icon-btn" aria-label={t('picker.language')} aria-expanded={languageOpen} onClick={openLanguage}>
          <span aria-hidden="true">🌐</span>
          <span className="nav-label lang-native">{activeLanguage?.native || language}</span>
        </button>
        {languageOpen && (
          <div className="dropdown-menu" role="group" aria-label={t('picker.language')}>
            <input
              className="input menu-search"
              type="search"
              value={languageQuery}
              onChange={(e) => setLanguageQuery(e.target.value)}
              placeholder={t('picker.searchLanguage')}
              aria-label={t('picker.searchLanguage')}
              autoFocus
            />
            {languageRows.length === 0 && <p className="menu-empty">{t('picker.noMatch')}</p>}
            {languageRows.map((l) => (
              <button
                key={l.code}
                type="button"
                className="dropdown-row"
                aria-pressed={l.code.toLowerCase() === language.toLowerCase()}
                onClick={() => {
                  setLanguage(l.code);
                  setLanguageOpen(false);
                }}
              >
                <span className="row-native" aria-hidden="true">{l.native}</span>
                <span aria-hidden="true">—</span>
                <span className="row-name">{l.name}</span>
                <span
                  className={`row-ui-tag${hasUi(l.code) ? ' row-ui-full' : ''}`}
                  aria-hidden="true"
                  title={hasUi(l.code) ? 'Interface translated' : 'Interface stays in English for now'}
                >
                  {hasUi(l.code) ? '✓ UI' : 'EN'}
                </span>
                {l.code.toLowerCase() === language.toLowerCase() && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
