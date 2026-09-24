import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { setDisplayCurrency } from './money.js';
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

// money() reads a module-level code, and it may render during the very first
// paint — so seed it from localStorage here, at import time, not in an effect.
setDisplayCurrency(readStored('cc.currency', 'USD'));

/** Exact code first, then base language ('pa-Arab' → 'pa'), else nothing. */
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
  const reconciledFor = useRef(null);

  const dir = useMemo(() => (languageEntry(language)?.rtl ? 'rtl' : 'ltr'), [language]);

  // Every currency change — from the picker or from the account reconcile
  // below — must reach money() and localStorage, whichever path changed it.
  useEffect(() => {
    setDisplayCurrency(currency);
    persist('cc.currency', currency);
  }, [currency]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    persist('cc.language', language);
  }, [language, dir]);

  // When a session appears (mount, login, refresh), adopt the account's own
  // saved choices once — the signed-in account is the source of truth across
  // devices. Reconciling only on that transition (not on every user object)
  // keeps a preferences PATCH that is still in flight from being fought by
  // the old server value.
  useEffect(() => {
    if (!user) {
      reconciledFor.current = null;
      return;
    }
    const who = user.id || user.email;
    if (reconciledFor.current === who) return;
    reconciledFor.current = who;
    if (user.currency) {
      setCurrencyState(user.currency);
      setDisplayCurrency(user.currency);
      persist('cc.currency', user.currency);
    }
    if (user.language) {
      setLanguageState(user.language);
      persist('cc.language', user.language);
    }
  }, [user]);

  const setCurrency = useCallback(
    (code) => {
      if (!code || code === currency) return;
      setCurrencyState(code);
      setDisplayCurrency(code);
      persist('cc.currency', code);
      if (user) updatePreferences?.({ currency: code });
    },
    [currency, user, updatePreferences]
  );

  const setLanguage = useCallback(
    (code) => {
      if (!code || code === language) return;
      setLanguageState(code);
      persist('cc.language', code);
      if (user) updatePreferences?.({ language: code });
    },
    [language, user, updatePreferences]
  );

  // Per-key fallback: active language → English → the key string itself, so
  // an untranslated (or misspelled) key still shows something readable.
  const t = useCallback(
    (key) => {
      const dict = dictionaries[language] || dictionaries[language.split('-')[0]];
      if (dict && dict[key] !== undefined) return dict[key];
      if (dictionaries.en[key] !== undefined) return dictionaries.en[key];
      return key;
    },
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, currency, setCurrency, t, dir }),
    [language, setLanguage, currency, setCurrency, t, dir]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
