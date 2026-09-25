import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setCsrfToken } from './api.js';

const AuthContext = createContext(null);

/** Applies theme + text size to <html> and mirrors them in localStorage. */
export function applyPreferences(theme, fontScale) {
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('cc.theme', theme);
    } catch {}
  }
  if (fontScale) {
    const sizes = { 1: '14px', 2: '16px', 3: '18px', 4: '20px' };
    document.documentElement.style.fontSize = sizes[fontScale] || '16px';
    try {
      localStorage.setItem('cc.fontScale', String(fontScale));
    } catch {}
  }
}

/**
 * One theme rule for sign-in paths: a theme picked on THIS device (the
 * `cc.theme.picked` flag the landing/dashboard toggle sets) wins over the
 * copy stored on the account and is pushed up — so the dark page somebody
 * chose stays dark through sign-in instead of snapping back to the
 * account's light default. Fresh devices simply take the account's theme.
 */
function applyThemeFromDevice(user) {
  let deviceTheme = '';
  try {
    if (localStorage.getItem('cc.theme.picked') === '1') {
      deviceTheme = localStorage.getItem('cc.theme') || '';
    }
  } catch {}
  if (deviceTheme && deviceTheme !== user.theme) {
    applyPreferences(deviceTheme, user.fontScale);
    api.patch('/api/auth/me/preferences', { theme: deviceTheme }).catch(() => {});
  } else {
    applyPreferences(user.theme, user.fontScale);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setCsrfToken(data.csrfToken);
      setUser(data.user);
      // The device's picked theme wins over the account copy (see
      // applyThemeFromDevice) — the same rule language/currency picks follow.
      if (data.user) applyThemeFromDevice(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // One theme for the WHOLE site: when another tab (landing, a form, the
  // dashboard) flips the theme, every other open page follows immediately
  // instead of showing its own colours until the next reload.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== 'cc.theme' || !e.newValue) return;
      try {
        document.documentElement.setAttribute('data-theme', e.newValue);
      } catch {}
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    const me = await api.get('/api/auth/me');
    setCsrfToken(me.csrfToken);
    setUser(data.user);
    applyThemeFromDevice(data.user);
    return data.user;
  };

  // The administrator door posts to its own endpoint (AUTH-3), but it must
  // land in the same context state as the student login — otherwise
  // RequireAdmin still sees the anonymous visitor it saw on first paint and
  // bounces the freshly-signed-in admin straight back to /control/login.
  const controlLogin = async (email, password) => {
    const data = await api.post('/api/auth/control-login', { email, password });
    const me = await api.get('/api/auth/me');
    setCsrfToken(me.csrfToken);
    setUser(data.user);
    applyThemeFromDevice(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const data = await api.post('/api/auth/register', payload);
    const me = await api.get('/api/auth/me');
    setCsrfToken(me.csrfToken);
    setUser(data.user);
    applyThemeFromDevice(data.user);
    return data.user;
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };

  // Theme/font stay display preferences; currency/language travel through
  // the same endpoint but applyPreferences must not touch them — locale.jsx
  // owns those (they change money() and <html lang/dir>, not <html> styling).
  const updatePreferences = async ({ theme, fontScale, currency, language }) => {
    const body = {};
    if (theme !== undefined) body.theme = theme;
    if (fontScale !== undefined) body.fontScale = fontScale;
    if (currency !== undefined) body.currency = currency;
    if (language !== undefined) body.language = language;
    const data = await api.patch('/api/auth/me/preferences', body);
    setUser(data.user);
    // An explicit pick becomes THIS device's copy first, so the device-win
    // rule below can never re-apply the previous theme over the new choice
    // (and other tabs pick the change up through the storage event).
    if (body.theme !== undefined) {
      try {
        localStorage.setItem('cc.theme', body.theme);
      } catch {}
    }
    applyThemeFromDevice(data.user);
    return data.user;
  };

  const updateProfile = async (payload) => {
    const data = await api.patch('/api/auth/me/profile', payload);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, controlLogin, register, logout, refresh, updatePreferences, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
