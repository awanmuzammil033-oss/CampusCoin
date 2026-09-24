import { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const NAV = [
  { section: 'Money' },
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/transactions', label: 'Transactions', icon: '🧾' },
  { to: '/recurring', label: 'Recurring', icon: '🔁' },
  { to: '/categories', label: 'Categories', icon: '🏷️' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { section: 'Understand' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/insights', label: 'Insights', icon: '🌤️' },
  { to: '/tips', label: 'Tips', icon: '💡' },
  { to: '/bookmarks', label: 'Bookmarks', icon: '🔖' },
  { section: 'Account' },
  { to: '/profile', label: 'Profile & settings', icon: '⚙️' },
];

const BOTTOM = [
  { to: '/dashboard', label: 'Home', icon: '🏠' },
  { to: '/transactions/new', label: 'Add', icon: '➕' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/profile', label: 'More', icon: '⋯' },
];

/**
 * App chrome: top bar (brand, bell, theme, text size, account menu),
 * left navigation on desktop, bottom tab bar on phones (design.md §3).
 */
export default function Layout({ children }) {
  const { user, logout, updatePreferences } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [feed, setFeed] = useState([]);
  const [accountOpen, setAccountOpen] = useState(false);

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
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="nav-label">Campus Coin</span>
        </Link>
        <div className="topbar-spacer" />

        <button type="button" className="icon-btn" onClick={() => changeFont(-1)} aria-label="Decrease text size" title="Smaller text">
          A−
        </button>
        <button type="button" className="icon-btn" onClick={() => changeFont(1)} aria-label="Increase text size" title="Larger text">
          A+
        </button>
        <button type="button" className="icon-btn" onClick={cycleTheme} aria-label="Switch colour theme" title="Light / dark">
          {document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'}
        </button>

        <div className="position-relative">
          <button type="button" className="icon-btn" onClick={toggleBell} aria-expanded={bellOpen} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            🔔
            {unread > 0 && <span className="badge-count">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {bellOpen && (
            <div className="card position-absolute" style={{ right: 0, top: 52, width: 320, zIndex: 140 }}>
              <div className="card-title">
                <span>Notifications</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.post('/api/notifications/read-all').then(() => { setUnread(0); setFeed((r) => r.map((x) => ({ ...x, isRead: true }))); }).catch(() => {})}>
                  Mark all read
                </button>
              </div>
              {feed.length === 0 && <p className="muted smallish mb-0">Nothing new right now.</p>}
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
              <Link className="nav-link-cc" to="/profile" onClick={() => setAccountOpen(false)}>⚙️ Profile & settings</Link>
              <Link className="nav-link-cc" to="/bookmarks" onClick={() => setAccountOpen(false)}>🔖 Bookmarks</Link>
              <button type="button" className="nav-link-cc w-100" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={handleLogout}>
                🚪 Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Main">
          {NAV.map((item, i) =>
            item.section ? (
              <div className="nav-section" key={`s-${i}`}>{item.section}</div>
            ) : (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link-cc ${isActive ? 'active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            )
          )}
        </nav>

        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Link to="/transactions/new" className="fab" aria-label="Add a transaction">＋</Link>

      <nav className="bottom-tabs" aria-label="Quick navigation">
        {BOTTOM.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}>
            <span className="tab-ico" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
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
