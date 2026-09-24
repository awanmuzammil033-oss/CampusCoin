import { Link } from 'react-router-dom';
import { useLocale } from '../locale.jsx';
import LocalePickers from '../components/LocalePickers.jsx';

/**
 * Home (public): the pitch, the feature strip, the sitemap (SRS deliverable
 * §1.9 — a real nested list of links, not a picture), and the footer. The
 * currency + language pickers live here too, so a visitor can switch before
 * signing in — the choice persists in localStorage and then on the account.
 */
export default function Home() {
  const { t } = useLocale();

  return (
    <div>
      <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          {t('app.name')}
        </Link>
        <div className="topbar-spacer" />
        <LocalePickers />
        <Link className="btn btn-ghost btn-sm" to="/login">{t('auth.signIn')}</Link>
        <Link className="btn btn-primary btn-sm" to="/register">{t('home.createAccount')}</Link>
      </header>

      <main id="main-content">
        <section className="landing-hero">
          <h1>{t('home.heroTitle')}</h1>
          <p className="tagline">{t('home.heroTagline')}</p>
          <div className="d-flex gap-3 justify-content-center flex-wrap">
            <Link className="btn btn-primary" to="/register">{t('home.getStarted')}</Link>
            <Link className="btn btn-secondary" to="/login">{t('home.iHaveAnAccount')}</Link>
          </div>
        </section>

        <section className="feature-strip" aria-label={t('home.featuresAria')}>
          <div className="card">
            <h3>⚡ {t('home.feature.quickTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.quickText')}</p>
          </div>
          <div className="card">
            <h3>🎯 {t('home.feature.budgetTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.budgetText')}</p>
          </div>
          <div className="card">
            <h3>📊 {t('home.feature.reportTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.reportText')}</p>
          </div>
          <div className="card">
            <h3>💡 {t('home.feature.tipTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.tipText')}</p>
          </div>
        </section>

        {/* Sitemap (SRS §1.9): real links, grouped, keyboard-navigable. */}
        <section className="sitemap-block card" aria-labelledby="sitemap-heading">
          <h2 id="sitemap-heading">{t('home.sitemap')}</h2>
          <p className="muted">{t('home.sitemapSubtitle')}</p>
          <nav aria-label={t('home.sitemap')} className="sitemap-grid">
            <div>
              <h3>{t('nav.section.account')}</h3>
              <ul>
                <li><Link to="/register">{t('home.link.register')}</Link></li>
                <li><Link to="/login">{t('auth.signIn')}</Link></li>
                <li><Link to="/forgot-password">{t('home.link.resetPassword')}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t('nav.section.money')}</h3>
              <ul>
                <li><Link to="/dashboard">{t('nav.dashboard')}</Link></li>
                <li><Link to="/transactions">{t('nav.transactions')}</Link></li>
                <li><Link to="/transactions/new">{t('home.link.addIncomeExpense')}</Link></li>
                <li><Link to="/transactions/import">{t('home.link.importCsv')}</Link></li>
                <li><Link to="/recurring">{t('home.link.recurringEntries')}</Link></li>
                <li><Link to="/categories">{t('nav.categories')}</Link></li>
                <li><Link to="/budgets">{t('nav.budgets')}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t('nav.section.understand')}</h3>
              <ul>
                <li><Link to="/reports">{t('nav.reports')}</Link></li>
                <li><Link to="/insights">{t('home.link.monthlyInsights')}</Link></li>
                <li><Link to="/tips">{t('home.link.savingTips')}</Link></li>
                <li><Link to="/bookmarks">{t('home.link.bookmarksNotes')}</Link></li>
                <li><Link to="/notifications">{t('topbar.notifications')}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t('home.section.settings')}</h3>
              <ul>
                <li><Link to="/profile">{t('home.link.profile')}</Link></li>
                <li><Link to="/profile">{t('home.link.theme')}</Link></li>
                <li><Link to="/profile">{t('home.link.textSize')}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t('home.section.staff')}</h3>
              <ul>
                <li><Link to="/control/login">{t('home.link.adminSignIn')}</Link></li>
              </ul>
            </div>
          </nav>
        </section>
      </main>

      <footer className="site-footer">
        <p className="mb-1">{t('home.footerBlurb')}</p>
        <p className="mb-0">{t('home.footerDisclaimer')}</p>
      </footer>
    </div>
  );
}
