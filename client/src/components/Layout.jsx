import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { useLocale } from '../locale.jsx';
import LocalePickers from './LocalePickers.jsx';
import Icon from './Icon.jsx';
import { NotificationBell } from './NotificationPanel.jsx';
import QrPaySheet, { QrPayFab } from './QrPaySheet.jsx';

const NAV = [
  { sectionKey: 'nav.section.money' },
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'home' },
  { to: '/transactions', labelKey: 'nav.transactions', icon: 'card' },
  { to: '/wallets', labelKey: 'nav.wallets', icon: 'wallet' },
  { to: '/recurring', labelKey: 'nav.recurring', icon: 'repeat' },
  { to: '/subscriptions', labelKey: 'nav.subscriptions', icon: 'hourglass' },
  { to: '/categories', labelKey: 'nav.categories', icon: 'categories' },
  { to: '/budgets', labelKey: 'nav.budgets', icon: 'target' },
  { sectionKey: 'nav.section.standout' },
  { to: '/groups', labelKey: 'nav.groups', icon: 'users' },
  { to: '/wishlist', labelKey: 'nav.wishlist', icon: 'gift' },
  { to: '/vault', labelKey: 'nav.vault', icon: 'vault' },
  { sectionKey: 'nav.section.tools' },
  { to: '/savings-options', labelKey: 'nav.savingsOptions', icon: 'piggy' },
  { to: '/grow-money', labelKey: 'nav.growMoney', icon: 'trendUp' },
  { to: '/side-income', labelKey: 'nav.sideIncome', icon: 'briefcase' },
  { sectionKey: 'nav.section.understand' },
  { to: '/reports', labelKey: 'nav.reports', icon: 'chart' },
  { to: '/insights', labelKey: 'nav.insights', icon: 'insightWeather' },
  { to: '/tips', labelKey: 'nav.tips', icon: 'bulb' },
  { to: '/bookmarks', labelKey: 'nav.bookmarks', icon: 'bookmark' },
  { sectionKey: 'nav.section.account' },
  { to: '/your-data', labelKey: 'nav.yourData', icon: 'shield' },
  { to: '/profile', labelKey: 'nav.profile', icon: 'settings' },
];

const BOTTOM = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'home' },
  { to: '/transactions', labelKey: 'nav.transactions', icon: 'card' },
  { isScan: true, labelKey: 'qr.title', icon: 'scan' },
  { to: '/groups', labelKey: 'nav.groups', icon: 'users' },
  { to: '/profile', labelKey: 'nav.profile', icon: 'user' },
];

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const inConversation = /\/groups\/[^/]+\/chat/.test(pathname);
  const { user, logout, updatePreferences } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // Close menus on Escape key
  useEffect(() => {
    if (!accountOpen && !menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setAccountOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountOpen, menuOpen]);

  // Prevent background scroll when sidebar drawer is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  async function changeFont(delta) {
    const current = Number(localStorage.getItem('cc.fontScale') || 2);
    const next = Math.min(4, Math.max(1, current + delta));
    await updatePreferences({ fontScale: next });
  }

  async function handleLogout() {
    await logout();
    navigate('/?panel=login');
  }

  return (
    <>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            {/* Hamburger button beside the logo on mobile/tablet */}
            <button
              type="button"
              className="icon-btn topbar-hamburger-btn"
              onClick={() => { setMenuOpen((v) => !v); setAccountOpen(false); }}
              aria-expanded={menuOpen}
              aria-label={t('topbar.allPages')}
              title={t('topbar.allPages')}
            >
              <Icon name="menu" size={20} />
            </button>

            <Link to="/dashboard" className="brand">
              <span className="brand-mark" aria-hidden="true">C</span>
              <span className="brand-name">{t('app.name')}</span>
            </Link>
          </div>

          <div className="topbar-spacer" />

          <div className="topbar-utility">
            <LocalePickers onOpen={() => { setAccountOpen(false); setMenuOpen(false); }} />
          </div>

          <div className="topbar-actions">
            <ThemeToggle />
            <NotificationBell />

            <div className="position-relative">
              <button
                type="button"
                className="icon-btn"
                onClick={() => { setAccountOpen((v) => !v); setMenuOpen(false); }}
                aria-expanded={accountOpen}
                aria-label={t('topbar.account')}
              >
                <span><Icon name="user" /></span>
                <span className="nav-label">{user?.name?.split(' ')[0]}</span>
              </button>

              {accountOpen && (
                <div className="cc-popover cc-popover-account" role="dialog" aria-label={t('topbar.account')}>
                  <div className="cc-popover-account-email">
                    <strong>{user?.name}</strong>
                    <span className="smallish muted">{user?.email}</span>
                  </div>
                  <Link className="nav-link-cc" to="/profile" onClick={() => setAccountOpen(false)}>
                    <Icon name="settings" /> {t('account.profileSettings')}
                  </Link>
                  <Link className="nav-link-cc" to="/bookmarks" onClick={() => setAccountOpen(false)}>
                    <Icon name="bookmark" /> {t('account.bookmarks')}
                  </Link>
                  <button type="button" className="nav-link-cc w-100 cc-signout" onClick={handleLogout}>
                    <Icon name="logout" /> {t('account.signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Desktop / Window layout */}
        <div className="layout">
          <nav className="sidebar" aria-label={t('a11y.mainNav')}>
            {NAV.map((item, i) =>
              item.sectionKey ? (
                <div className="nav-section" key={`s-${i}`}>{t(item.sectionKey)}</div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-link-cc ${isActive ? 'active' : ''}`}
                  title={t(item.labelKey)}
                  aria-label={t(item.labelKey)}
                >
                  <span className="nav-ico"><Icon name={item.icon} title={t(item.labelKey)} /></span>
                  <span className="nav-label">{t(item.labelKey)}</span>
                </NavLink>
              )
            )}
          </nav>

          <main className="content" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>

        {/* Floating Action Buttons */}
        {!inConversation && (
          <div className="cc-fabs">
            <QrPayFab />
            <Link to="/transactions/new" className="fab" aria-label={t('a11y.addTransaction')} title={t('a11y.addTransaction')}>
              <Icon name="plus" />
            </Link>
          </div>
        )}
      </div>

      {/* Screen Blur Backdrop when Mobile Sidebar Drawer is open */}
      {menuOpen && (
        <div
          className="cc-drawer-backdrop"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        />
      )}

      {/* Attractive Mobile Sidebar Drawer */}
      <aside className={`cc-mobile-sidebar ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
        <div className="cc-mobile-sidebar-head">
          <div className="d-flex align-items-center gap-2">
            <span className="brand-mark" aria-hidden="true">C</span>
            <div>
              <strong className="d-block brand-title">{t('app.name')}</strong>
              <span className="smallish muted user-greeting">{user?.name ? `${user.name.split(' ')[0]}` : 'Student'}</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn cc-mobile-sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label={t('ui.close')}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="cc-mobile-sidebar-tools">
          <div className="cc-sheet-textsize">
            <span className="smallish muted">{t('prof.textSize')}</span>
            <span className="cc-sheet-textsize-btns">
              <button type="button" className="icon-btn" onClick={() => changeFont(-1)} aria-label={t('a11y.decreaseText')} title={t('topbar.smallerText')}>
                <Icon name="fontSize" />
                <Icon name="minus" />
              </button>
              <button type="button" className="icon-btn" onClick={() => changeFont(1)} aria-label={t('a11y.increaseText')} title={t('topbar.largerText')}>
                <Icon name="fontSize" />
                <Icon name="plus" />
              </button>
            </span>
          </div>
        </div>

        <div className="cc-mobile-sidebar-nav">
          {NAV.map((item, i) =>
            item.sectionKey ? (
              <div className="cc-drawer-section" key={`s-${i}`}>{t(item.sectionKey)}</div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `cc-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="cc-drawer-ico"><Icon name={item.icon} /></span>
                <span>{t(item.labelKey)}</span>
              </NavLink>
            )
          )}
          <NavLink to="/notifications" className="cc-drawer-link" onClick={() => setMenuOpen(false)}>
            <span className="cc-drawer-ico"><Icon name="bell" /></span>
            <span>{t('topbar.allNotifications')}</span>
          </NavLink>

          <button type="button" className="cc-drawer-link cc-drawer-signout mt-3" onClick={handleLogout}>
            <span className="cc-drawer-ico"><Icon name="logout" /></span>
            <span>{t('account.signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Bottom Navbar for Mobile Screens - Fixed at viewport bottom */}
      <nav className="bottom-tabs" aria-label={t('a11y.quickNav')}>
        {BOTTOM.map((item, idx) =>
          item.isScan ? (
            <button
              key="btn-scan"
              type="button"
              className="bottom-tab bottom-tab-scan"
              onClick={() => setQrOpen(true)}
              aria-label={t(item.labelKey)}
              title={t(item.labelKey)}
            >
              <span className="tab-ico-scan">
                <Icon name={item.icon} size={22} />
              </span>
              <span className="tab-label">{t(item.labelKey)}</span>
            </button>
          ) : (
            <NavLink
              key={item.to || idx}
              to={item.to}
              className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
              title={t(item.labelKey)}
              aria-label={t(item.labelKey)}
            >
              <span className="tab-ico"><Icon name={item.icon} title={t(item.labelKey)} /></span>
              <span className="tab-label">{t(item.labelKey)}</span>
            </NavLink>
          )
        )}
      </nav>

      {/* QR & Barcode Pay Modal triggered from bottom navigation */}
      {qrOpen && <QrPaySheet open onClose={() => setQrOpen(false)} />}
    </>
  );
}
