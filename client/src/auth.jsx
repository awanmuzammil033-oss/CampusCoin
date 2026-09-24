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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setCsrfToken(data.csrfToken);
      setUser(data.user);
      if (data.user) applyPreferences(data.user.theme, data.user.fontScale);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    const me = await api.get('/api/auth/me');
    setCsrfToken(me.csrfToken);
    setUser(data.user);
    applyPreferences(data.user.theme, data.user.fontScale);
    return data.user;
  };

  const register = async (payload) => {
    const data = await api.post('/api/auth/register', payload);
    const me = await api.get('/api/auth/me');
    setCsrfToken(me.csrfToken);
    setUser(data.user);
    applyPreferences(data.user.theme, data.user.fontScale);
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
    applyPreferences(data.user.theme, data.user.fontScale);
    return data.user;
  };

  const updateProfile = async (payload) => {
    const data = await api.patch('/api/auth/me/profile', payload);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh, updatePreferences, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
