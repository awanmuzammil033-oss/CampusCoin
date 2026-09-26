import { Link } from 'react-router-dom';

import Icon from './Icon.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import LocalePickers from './LocalePickers.jsx';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';

/**
 * The frame for the pages that are readable before anyone signs in.
 *
 * These two rooms - the savings reference table and the side-income library -
 * are reference material, so making an account first would be the wrong door.
 * But outside the signed-in shell they had no header and no page container
 * either, and a page whose content runs into the edges of the screen looks
 * broken even when the content itself is good.
 *
 * So this is the same chrome the app has, minus the parts that need an account:
 * the brand, the two pickers, the theme, and one button that sends you where
 * you actually want to go depending on whether you are signed in.
 */
export default function PublicShell({ children }) {
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <div className="cc-public">
      <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

      <header className="cc-public-bar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">{t('app.name')}</span>
        </Link>

        <div className="cc-public-actions">
          <LocalePickers />
          <ThemeToggle />

          {user ? (
            <Link className="btn btn-primary btn-sm" to={user.role === 'admin' ? '/control' : '/dashboard'}>
              <Icon name="arrowRight" size={15} /> {t('nav.dashboard')}
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm cc-public-signin" to="/login">
                {t('auth.signIn')}
              </Link>
              <Link className="btn btn-primary btn-sm" to="/register">
                {t('home.getStarted')}
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="cc-public-main" id="main-content">{children}</main>

      <footer className="cc-public-foot">
        <Link to="/" className="cc-public-back">
          <Icon name="arrowLeft" size={15} /> {t('common.backToHome')}
        </Link>
        <div className="cc-public-foot-links">
          <Link to="/savings-options">{t('nav.savingsOptions')}</Link>
          <Link to="/grow-money">{t('nav.growMoney')}</Link>
          <Link to="/side-income">{t('nav.sideIncome')}</Link>
        </div>
      </footer>
    </div>
  );
}
