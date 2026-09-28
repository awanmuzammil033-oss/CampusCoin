import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setApiTranslator } from './api.js';
import { useAuth } from './auth.jsx';
import { setDisplayCurrency, setLedgerCurrency } from './money.js';
import { LANGUAGES } from './data/languages.js';
import dictionaries from './i18n/index.js';

/**
 * Locale context: which language the chrome speaks and which currency money()
 * formats amounts in. Deliberately display-only — nothing here converts
 * numbers, it only changes how they and the labels around them are shown.
 */

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// money() reads module-level codes and may render during the very first paint,
// so seed them from localStorage here, at import time, not in an effect.
const storedLedger = readStored('cc.ledgerCurrency', '') || readStored('cc.currency', 'USD');
setDisplayCurrency(readStored('cc.currency', 'USD'), storedLedger);

/** Exact code first, then base language ('pa-Arab' - 'pa'), else nothing. */
function languageEntry(code) {
  const wanted = String(code || '').toLowerCase();
  return (
    LANGUAGES.find((l) => l.code.toLowerCase() === wanted) ||
    LANGUAGES.find((l) => l.code.split('-')[0].toLowerCase() === wanted.split('-')[0]) ||
    null
  );
}

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const { user, updatePreferences } = useAuth() || {};
  const [language, setLanguageState] = useState(() => readStored('cc.language', 'en'));
  const [currency, setCurrencyState] = useState(() => readStored('cc.currency', 'USD'));
  const [ledgerCurrency, setLedgerState] = useState(() => readStored('cc.ledgerCurrency', '') || readStored('cc.currency', 'USD'));
  const reconciledFor = useRef(null);

  const dir = useMemo(() => (languageEntry(language)?.rtl ? 'rtl' : 'ltr'), [language]);

  // Every currency change — from the picker or from the account reconcile
  // below — must reach money() and localStorage, whichever path changed it.
  useEffect(() => {
    setDisplayCurrency(currency, ledgerCurrency);
    persist('cc.currency', currency);
  }, [currency, ledgerCurrency]);

  // The student's own currency (what their amounts are in) is a separate
  // setting: changing the display currency must never move this one, or
  // "400 PKR" would quietly become "400 dollars".
  useEffect(() => {
    setLedgerCurrency(ledgerCurrency);
    persist('cc.ledgerCurrency', ledgerCurrency);
  }, [ledgerCurrency]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    persist('cc.language', language);
  }, [language, dir]);

  useEffect(() => {
    if (!user) {
      reconciledFor.current = null;
      return;
    }
    const who = user.id || user.email;
    if (reconciledFor.current === who) return;
    reconciledFor.current = who;

    // The pickers mark a choice as explicitly made on THIS device. Such a
    // choice is the newer intent, so it is pushed up to the account — letting
    // an older saved value win would silently undo the click the user just
    // made (the classic case: pick Urdu as a visitor, log in, and watch it
    // snap back to English). Without a local mark the account comes down as
    // before, so other devices still sync.
    const pickedLanguage = readStored('cc.language.picked', '') === '1' ? readStored('cc.language', '') : '';
    const pickedCurrency = readStored('cc.currency.picked', '') === '1' ? readStored('cc.currency', '') : '';

    if (pickedLanguage && user.language && pickedLanguage !== user.language) {
      updatePreferences?.({ language: pickedLanguage });
    } else if (!pickedLanguage && user.language && user.language !== language) {
      setLanguageState(user.language);
      persist('cc.language', user.language);
    }

    if (pickedCurrency && user.currency && pickedCurrency !== user.currency) {
      updatePreferences?.({ currency: pickedCurrency });
    } else if (!pickedCurrency && user.currency && user.currency !== currency) {
      setCurrencyState(user.currency);
      setDisplayCurrency(user.currency);
      persist('cc.currency', user.currency);
    }

    // The account's own currency (what the stored amounts are in) always wins
    // over this device unless the student changed it here on purpose.
    const accountLedger = user.ledgerCurrency || user.currency;
    const pickedLedger = readStored('cc.ledgerCurrency.picked', '') === '1' ? readStored('cc.ledgerCurrency', '') : '';
    if (pickedLedger && accountLedger && pickedLedger !== accountLedger) {
      updatePreferences?.({ ledgerCurrency: pickedLedger });
    } else if (!pickedLedger && accountLedger && accountLedger !== ledgerCurrency) {
      setLedgerState(accountLedger);
      setLedgerCurrency(accountLedger);
      persist('cc.ledgerCurrency', accountLedger);
    }
  }, [user, updatePreferences, language, currency, ledgerCurrency]);

  // Choosing in a picker records an explicit local mark — reconcile (above)
  // uses it to tell "the user just clicked this" apart from "the account
  // already said this".
  const setCurrency = useCallback(
    (code) => {
      if (!code || code === currency) return;
      setCurrencyState(code);
      setDisplayCurrency(code);
      persist('cc.currency', code);
      persist('cc.currency.picked', '1');
      if (user) updatePreferences?.({ currency: code });
    },
    [currency, user, updatePreferences]
  );

  // Changing the student's own currency is a deliberate act (Profile does
  // it), so it is recorded as a local pick the same way the pickers are.
  const setLedger = useCallback(
    (code) => {
      if (!code || code === ledgerCurrency) return;
      setLedgerState(code);
      setLedgerCurrency(code);
      persist('cc.ledgerCurrency', code);
      persist('cc.ledgerCurrency.picked', '1');
      if (user) updatePreferences?.({ ledgerCurrency: code });
    },
    [ledgerCurrency, user, updatePreferences]
  );

  const setLanguage = useCallback(
    (code) => {
      if (!code || code === language) return;
      setLanguageState(code);
      persist('cc.language', code);
      persist('cc.language.picked', '1');
      if (user) updatePreferences?.({ language: code });
    },
    [language, user, updatePreferences]
  );

  // Per-key fallback: active language - English - the key string itself, so
  // an untranslated (or misspelled) key still shows something readable.
  // `vars` fills {placeholders}: t('dash.hi', { name: 'Aisha' }).
  const format = (s, vars) =>
    vars ? s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m)) : s;

  const t = useCallback(
    (key, vars) => {
      const dict = dictionaries[language] || dictionaries[language.split('-')[0]];
      let s;
      if (dict && dict[key] !== undefined) s = dict[key];
      else if (dictionaries.en[key] !== undefined) s = dictionaries.en[key];
      else s = key;
      return format(s, vars);
    },
    [language]
  );

  /**
   * Let api.js speak this reader's language when the server does not answer.
   *
   * Registered on every change of `t` rather than once, so switching language
   * mid-session also switches the sentence a network failure produces - a stale
   * closure here would tell a student who just chose Urdu that the server is down,
   * in English.
   */
  useEffect(() => {
    setApiTranslator((key) => t(key));
    return () => setApiTranslator(null);
  }, [t]);

  // Countable phrases: `plural('dash.incomeCount', n, { n })` picks the key
  // suffix Intl.PluralRules wants for this language (one/few/many/other) and
  // falls back to .other, then the bare base key. English ships .one/.other.
  const plural = useCallback(
    (base, n, vars) => {
      const count = Number(n);
      let cat = 'other';
      try {
        cat = new Intl.PluralRules(language).select(count);
      } catch {}
      const dict = dictionaries[language] || dictionaries[language.split('-')[0]];
      let s;
      if (dict && dict[`${base}.${cat}`] !== undefined) s = dict[`${base}.${cat}`];
      else if (dictionaries.en[`${base}.${cat}`] !== undefined) s = dictionaries.en[`${base}.${cat}`];
      else if (dict && dict[`${base}.other`] !== undefined) s = dict[`${base}.other`];
      else if (dictionaries.en[`${base}.other`] !== undefined) s = dictionaries.en[`${base}.other`];
      else if (dict && dict[base] !== undefined) s = dict[base];
      else s = base;
      return format(s, vars);
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      currency,
      setCurrency,
      ledgerCurrency,
      setLedgerCurrency: setLedger,
      t,
      plural,
      dir,
    }),
    [language, setLanguage, currency, setCurrency, ledgerCurrency, setLedger, t, plural, dir]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
