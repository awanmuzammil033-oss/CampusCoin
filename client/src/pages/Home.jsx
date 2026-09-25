import { Link } from 'react-router-dom';
import { useLocale } from '../locale.jsx';
import LocalePickers from '../components/LocalePickers.jsx';

/**
 * Home (public): the pitch with a friendly preview of the real product,
 * the feature strip, the three steps, honest numbers, a call to action,
 * the sitemap (SRS deliverable §1.9 — a real nested list of links, not a
 * picture), and the footer.
 *
 * The wrapper pins data-theme="light": the public face stays warm and
 * bright whatever dark/system theme the visitor's device asks for — the
 * dark palette belongs inside the app, not on the shop window. The
 * currency + language pickers live in the header so a visitor can switch
 * before signing in; the choice persists in localStorage and then on the
 * account.
 *
 * The preview card is a static mock of the dashboard (balance, savings
 * goal, budgets, category doughnut). It is deliberately all inside the
 * card — no floating pop-ups hovering over it.
 */
export default function Home() {
  const { t } = useLocale();

  return (
    <div className="landing" data-theme="light">
      <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">{t('app.name')}</span>
        </Link>
        <div className="topbar-spacer" />
        <LocalePickers />
        <Link className="btn btn-ghost btn-sm" to="/login">{t('auth.signIn')}</Link>
        <Link className="btn btn-primary btn-sm" to="/register">{t('home.createAccount')}</Link>
      </header>

      <main id="main-content">
        {/* ---------- hero: the pitch + the product itself ---------- */}
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">💰 {t('home.eyebrow')}</span>
            <h1>{t('home.heroTitle')}</h1>
            <p className="tagline">{t('home.heroTagline')}</p>
            <div className="lp-hero-cta">
              <Link className="btn btn-primary" to="/register">{t('home.getStarted')}</Link>
              <Link className="btn btn-secondary" to="/login">{t('home.iHaveAnAccount')}</Link>
            </div>
          </div>

          <div className="lp-preview" role="img" aria-label={t('home.previewAria')}>
            <div className="lp-p-head">
              <span className="brand-mark" aria-hidden="true">C</span>
              <strong>{t('app.name')}</strong>
              <span className="lp-p-chip">{t('nav.dashboard')}</span>
            </div>

            <div>
              <span className="lp-p-label">Balance</span>
              <strong className="lp-p-amount">$1,240.00</strong>
              <div className="lp-p-split">
                <span className="lp-up">↑ $1,600.00</span>
                <span className="lp-down">↓ $360.00</span>
              </div>
            </div>

            <div>
              <span className="lp-p-label">Savings goal <b>72%</b></span>
              <div className="lp-p-track"><span style={{ width: '72%' }} /></div>
            </div>

            <div>
              <span className="lp-p-label">Budget vs Actual</span>
              <div className="lp-p-budget">
                <span>🍔 Food</span>
                <span className="lp-p-track"><span style={{ width: '64%' }} /></span>
                <b>64%</b>
              </div>
              <div className="lp-p-budget">
                <span>🚌 Transport</span>
                <span className="lp-p-track over"><span style={{ width: '100%' }} /></span>
                <b className="lp-over-text">112%</b>
              </div>
            </div>

            <div className="lp-p-chart">
              <span className="lp-p-donut" aria-hidden="true" />
              <div className="lp-p-legend">
                <span><i className="dot d1" /> Hostel/Rent · 70%</span>
                <span><i className="dot d2" /> Transport · 30%</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- what it does ---------- */}
        <section className="lp-features" aria-label={t('home.featuresAria')}>
          <article className="lp-feature card">
            <span className="lp-f-icon i1" aria-hidden="true">⚡</span>
            <h3>{t('home.feature.quickTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.quickText')}</p>
          </article>
          <article className="lp-feature card">
            <span className="lp-f-icon i2" aria-hidden="true">🎯</span>
            <h3>{t('home.feature.budgetTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.budgetText')}</p>
          </article>
          <article className="lp-feature card">
            <span className="lp-f-icon i3" aria-hidden="true">📊</span>
            <h3>{t('home.feature.reportTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.reportText')}</p>
          </article>
          <article className="lp-feature card">
            <span className="lp-f-icon i4" aria-hidden="true">💡</span>
            <h3>{t('home.feature.tipTitle')}</h3>
            <p className="muted mb-0">{t('home.feature.tipText')}</p>
          </article>
        </section>

        {/* ---------- three steps ---------- */}
        <section className="lp-how" aria-labelledby="how-heading">
          <h2 id="how-heading">{t('home.howTitle')}</h2>
          <ol className="lp-steps">
            <li className="lp-step">
              <span className="lp-step-num n1" aria-hidden="true">1</span>
              <h3>{t('home.step1Title')}</h3>
              <p>{t('home.step1Text')}</p>
            </li>
            <li className="lp-step">
              <span className="lp-step-num n2" aria-hidden="true">2</span>
              <h3>{t('home.step2Title')}</h3>
              <p>{t('home.step2Text')}</p>
            </li>
            <li className="lp-step">
              <span className="lp-step-num n3" aria-hidden="true">3</span>
              <h3>{t('home.step3Title')}</h3>
              <p>{t('home.step3Text')}</p>
            </li>
          </ol>
        </section>

        {/* ---------- real numbers, no invented stats ---------- */}
        <section className="lp-facts">
          <p>{t('home.facts')}</p>
        </section>

        {/* ---------- call to action ---------- */}
        <section className="lp-cta">
          <h2>{t('home.ctaTitle')}</h2>
          <p>{t('home.ctaText')}</p>
          <Link className="btn btn-cta" to="/register">{t('home.getStarted')}</Link>
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
