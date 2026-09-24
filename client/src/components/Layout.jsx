import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import { CURRENCIES } from '../data/currencies.js';
import { LANGUAGES } from '../data/languages.js';

const NAV = [
  { sectionKey: 'nav.section.money' },
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: '🏠' },
  { to: '/transactions', labelKey: 'nav.transactions', icon: '🧾' },
  { to: '/recurring', labelKey: 'nav.recurring', icon: '🔁' },
  { to: '/categories', labelKey: 'nav.categories', icon: '🏷️' },
  { to: '/budgets', labelKey: 'nav.budgets', icon: '🎯' },
  { sectionKey: 'nav.section.understand' },
  { to: '/reports', labelKey: 'nav.reports', icon: '📊' },
  { to: '/insights', labelKey: 'nav.insights', icon: '🌤️' },
  { to: '/tips', labelKey: 'nav.tips', icon: '💡' },
  { to: '/bookmarks', labelKey: 'nav.bookmarks', icon: '🔖' },
  { sectionKey: 'nav.section.account' },
  { to: '/profile', labelKey: 'nav.profile', icon: '⚙️' },
];

const BOTTOM = [
  { to: '/dashboard', labelKey: 'nav.home', icon: '🏠' },
  { to: '/transactions/new', labelKey: 'nav.add', icon: '➕' },
  { to: '/reports', labelKey: 'nav.reports', icon: '📊' },
  { to: '/budgets', labelKey: 'nav.budgets', icon: '🎯' },
  { to: '/profile', labelKey: 'nav.more', icon: '⋯' },
];

/**
 * App chrome: top bar (brand, currency + language pickers, text size, theme,
 * bell, account menu), left navigation on desktop, bottom tab bar on phones
 * (design.md §3). Every visible string goes through t() so the chrome follows
 * the language picked in the topbar.
 */
export default function Layout({ children }) {
  const { user, logout, updatePreferences } = useAuth();
  const { t, currency, setCurrency, language, setLanguage } = useLocale();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [feed, setFeed] = useState([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const currencyRef = useRef(null);
  const languageRef = useRef(null);

  // Recent notifications for the bell — fetched once when the chrome mounts.
  useEffect(() => {
    let alive = true;
    api
      .get('/api/notifications')
      .then((data) => {
        if (!alive) return;
        setUnread(data.unread || 0);
        setFeed(data.rows.slice(0, 8));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // While either picker is open: click outside closes it, Escape closes both.
  // Same idea as the bell/account popovers, but the long lists deserve an
  // explicit way out too.
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

  async function toggleBell() {
    const next = !bellOpen;
    setBellOpen(next);
    setAccountOpen(false);
    setCurrencyOpen(false);
    setLanguageOpen(false);
    if (next) {
      try {
        const data = await api.get('/api/notifications');
        setFeed(data.rows.slice(0, 8));
        setUnread(data.unread || 0);
      } catch {}
    }
  }

  async function markRead(id) {
    if (String(id).startsWith('ann-')) return; // campus notices are not per-person
    try {
      await api.post(`/api/notifications/${id}/read`);
      setUnread((n) => Math.max(0, n - 1));
      setFeed((rows) => rows.map((r) => (r.id === id ? { ...r, isRead: true } : r)));
    } catch {}
  }

  async function cycleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    await updatePreferences({ theme: current === 'dark' ? 'light' : 'dark' });
  }

  async function changeFont(delta) {
    const current = Number(localStorage.getItem('cc.fontScale') || 2);
    const next = Math.min(4, Math.max(1, current + delta));
    await updatePreferences({ fontScale: next });
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const activeCurrency = CURRENCIES.find((c) => c.code === currency);
  const activeLanguage = LANGUAGES.find((l) => l.code.toLowerCase() === language.toLowerCase());

  // Live filter: case-insensitive substring over code + name (and native for
  // languages) — with 150+ entries, scrolling alone is not enough.
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="nav-label">{t('app.name')}</span>
        </Link>
        <div className="topbar-spacer" />

        {/* Currency picker — display preference only, never a conversion. */}
        <div className="position-relative" ref={currencyRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('picker.currency')}
            aria-expanded={currencyOpen}
            onClick={() => {
              const next = !currencyOpen;
              setCurrencyOpen(next);
              setLanguageOpen(false);
              setBellOpen(false);
              setAccountOpen(false);
              if (next) setCurrencyQuery('');
            }}
          >
            <span aria-hidden="true">{activeCurrency?.symbol || currency}</span>
            <span>{currency}</span>
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
          <button
            type="button"
            className="icon-btn"
            aria-label={t('picker.language')}
            aria-expanded={languageOpen}
            onClick={() => {
              const next = !languageOpen;
              setLanguageOpen(next);
              setCurrencyOpen(false);
              setBellOpen(false);
              setAccountOpen(false);
              if (next) setLanguageQuery('');
            }}
          >
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
                  {l.code.toLowerCase() === language.toLowerCase() && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="icon-btn" onClick={() => changeFont(-1)} aria-label={t('a11y.decreaseText')} title={t('topbar.smallerText')}>
          A−
        </button>
        <button type="button" className="icon-btn" onClick={() => changeFont(1)} aria-label={t('a11y.increaseText')} title={t('topbar.largerText')}>
          A+
        </button>
        <button type="button" className="icon-btn" onClick={cycleTheme} aria-label={t('a11y.switchTheme')} title={t('topbar.lightDark')}>
          {document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'}
        </button>

        <div className="position-relative">
          <button
            type="button"
            className="icon-btn"
            onClick={toggleBell}
            aria-expanded={bellOpen}
            aria-label={`${t('topbar.notifications')}${unread ? `, ${unread} ${t('topbar.unread')}` : ''}`}
          >
            🔔
            {unread > 0 && <span className="badge-count">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {bellOpen && (
            <div className="card position-absolute" style={{ right: 0, top: 52, width: 320, zIndex: 140 }}>
              <div className="card-title">
                <span>{t('topbar.notifications')}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.post('/api/notifications/read-all').then(() => { setUnread(0); setFeed((r) => r.map((x) => ({ ...x, isRead: true }))); }).catch(() => {})}>
                  {t('topbar.markAllRead')}
                </button>
              </div>
              {feed.length === 0 && <p className="muted smallish mb-0">{t('topbar.nothingNew')}</p>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {feed.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="btn btn-ghost w-100 text-start smallish"
                      style={{ minHeight: 44 }}
                      onClick={() => markRead(n.id)}
                    >
                      <span aria-hidden="true">{iconFor(n.kind)}</span>{' '}
                      {!n.isRead && <strong>• </strong>}
                      {n.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="position-relative">
          <button
            type="button"
            className="icon-btn"
            onClick={() => { setAccountOpen((v) => !v); setBellOpen(false); setCurrencyOpen(false); setLanguageOpen(false); }}
            aria-expanded={accountOpen}
          >
            <span aria-hidden="true">👤</span>
            <span className="nav-label">{user?.name?.split(' ')[0]}</span>
          </button>
          {accountOpen && (
            <div className="card position-absolute" style={{ right: 0, top: 52, width: 240, zIndex: 140 }}>
              <div className="smallish muted mb-2">{user?.email}</div>
              <Link className="nav-link-cc" to="/profile" onClick={() => setAccountOpen(false)}>⚙️ {t('account.profileSettings')}</Link>
              <Link className="nav-link-cc" to="/bookmarks" onClick={() => setAccountOpen(false)}>🔖 {t('account.bookmarks')}</Link>
              <button type="button" className="nav-link-cc w-100" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={handleLogout}>
                🚪 {t('account.signOut')}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label={t('a11y.mainNav')}>
          {NAV.map((item, i) =>
            item.sectionKey ? (
              <div className="nav-section" key={`s-${i}`}>{t(item.sectionKey)}</div>
            ) : (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link-cc ${isActive ? 'active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{t(item.labelKey)}</span>
              </NavLink>
            )
          )}
        </nav>

        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Link to="/transactions/new" className="fab" aria-label={t('a11y.addTransaction')}>＋</Link>

      <nav className="bottom-tabs" aria-label={t('a11y.quickNav')}>
        {BOTTOM.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}>
            <span className="tab-ico" aria-hidden="true">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function iconFor(kind) {
  if (kind === 'budget_exceeded') return '⛔';
  if (kind === 'budget_near') return '⚠️';
  if (kind === 'announcement') return '📢';
  return 'ℹ️';
}
