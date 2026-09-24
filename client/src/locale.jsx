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
  }, [user, updatePreferences, language, currency]);

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
