import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth.jsx';

const NAV = [
  { to: '/control', label: 'Overview', icon: '📊', end: true },
  { to: '/control/categories', label: 'Categories', icon: '🏷️' },
  { to: '/control/templates', label: 'Templates', icon: '📝' },
  { to: '/control/announcements', label: 'Announcements', icon: '📢' },
  { to: '/control/users', label: 'Users', icon: '👥' },
];

/**
 * Shell for the administrator area: its own top bar and menu, so the student
 * navigation never appears on control screens (and vice versa).
 */
export default function ControlLayout() {
  const { updatePreferences, logout } = useAuth();
  const navigate = useNavigate();

  async function cycleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    try {
      await updatePreferences({ theme: current === 'dark' ? 'light' : 'dark' });
    } catch {
      /* the toggle is a convenience — never block on it */
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate('/control/login');
    }
  }

  return (
    <div className="app-shell admin-mode">
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className="topbar admin-mode" style={{ borderTop: '4px solid var(--cc-accent)' }}>
        <Link to="/control" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>Campus Coin · Control</span>
        </Link>
        <div className="topbar-spacer" />
        <Link className="btn btn-ghost btn-sm" to="/">
          View student site
        </Link>
        <button
          type="button"
          className="icon-btn"
          onClick={cycleTheme}
          aria-label="Switch colour theme"
          title="Light / dark"
        >
          {document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Control">
          <div className="nav-section">Administrator</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link-cc ${isActive ? 'active' : ''}`}
            >
              <span className="nav-ico" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
