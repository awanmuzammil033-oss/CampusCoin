import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth.jsx';
import { useLocale } from '../../locale.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';
import Icon from '../../components/Icon.jsx';

const NAV = [
  { to: '/control', label: 'ctl.navOverview', icon: 'chart', end: true },
  { to: '/control/categories', label: 'ctl.navCategories', icon: 'tag' },
  { to: '/control/templates', label: 'ctl.navTemplates', icon: 'note' },
  { to: '/control/announcements', label: 'ctl.navAnnouncements', icon: 'megaphone' },
  { to: '/control/users', label: 'ctl.navUsers', icon: 'users' },
];

/**
 * Shell for the administrator area: its own top bar and menu, so the student
 * navigation never appears on control screens (and vice versa).
 */
export default function ControlLayout() {
  const { updatePreferences, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate('/control/login');
    }
  }

  return (
    <div className="app-shell admin-mode">
      <a className="skip-link" href="#main-content">{t('ctl.skip')}</a>

      <header className="topbar admin-mode" style={{ borderTop: '4px solid var(--cc-accent)' }}>
        <Link to="/control" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>{t('ctl.brand')}</span>
        </Link>
        <div className="topbar-spacer" />
        <Link className="btn btn-ghost btn-sm" to="/">
          {t('ctl.viewStudent')}
        </Link>
        <ThemeToggle labels={{ aria: t('ctl.switchTheme'), title: t('ctl.themeTitle') }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
          {t('account.signOut')}
        </button>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label={t('ctl.navAria')}>
          <div className="nav-section">{t('ctl.administrator')}</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link-cc ${isActive ? 'active' : ''}`}
              title={t(item.label)}
              aria-label={t(item.label)}
            >
              <span className="nav-ico"><Icon name={item.icon} title={t(item.label)} /></span>
              <span className="nav-label">{t(item.label)}</span>
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
