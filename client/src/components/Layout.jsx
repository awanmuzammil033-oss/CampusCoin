import { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import LocalePickers from './LocalePickers.jsx';

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
  const { t } = useLocale();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [feed, setFeed] = useState([]);
  const [accountOpen, setAccountOpen] = useState(false);

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

  async function toggleBell() {
    const next = !bellOpen;
    setBellOpen(next);
    setAccountOpen(false);
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="nav-label">{t('app.name')}</span>
        </Link>
        <div className="topbar-spacer" />

        <LocalePickers onOpen={() => { setBellOpen(false); setAccountOpen(false); }} />

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
            onClick={() => { setAccountOpen((v) => !v); setBellOpen(false); }}
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
