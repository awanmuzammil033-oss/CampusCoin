import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../locale.jsx';
import LocalePickers from '../components/LocalePickers.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

/**
 * Home (public) — the design-board rebuild.
 *
 * Sections in order: sticky glass header, dark-green hero with the phone
 * mock + floating cards, stats band, feature grid, financial overview with
 * the dashboard + phone mocks, smart-feature trio, student categories,
 * privacy band, how-it-works, FAQ, closing CTA, sitemap (SRS §1.9) and the
 * footer with a back-to-top button.
 *
 * Theme: the wrapper no longer pins data-theme — the landing follows the
 * visitor's choice like the rest of the app (default light, dark persists
 * once picked) and the header carries the toggle so the choice can be made
 * right here.
 *
 * Motion: .lp-reveal elements fade/slide in on scroll (IntersectionObserver
 * with an instant fallback), cards lift on hover, the phone and floating
 * cards bob gently. prefers-reduced-motion switches all of it off in CSS.
 */
const NAV = [
  { id: 'top', label: 'home.nav.home' },
  { id: 'features', label: 'home.nav.features' },
  { id: 'how', label: 'home.nav.how' },
  { id: 'overview', label: 'home.nav.insights' },
  { id: 'faq', label: 'home.nav.faq' },
];

const PHONE_LEGEND = [
  { key: 'home.catFood', pct: 38, color: '#f5b400' },
  { key: 'home.catTransport', pct: 16, color: '#14b8a6' },
  { key: 'home.catHostel', pct: 15, color: '#2563eb' },
  { key: 'home.catAcademics', pct: 12, color: '#7c3aed' },
  { key: 'home.catEntertainment', pct: 10, color: '#db2777' },
  { key: 'home.catOther', pct: 9, color: '#64748b' },
];

export default function Home() {
  const { t } = useLocale();
  const [active, setActive] = useState('top');
  const [showTop, setShowTop] = useState(false);

  /* Scroll reveal: everything marked .lp-reveal rises in the first time it
     enters the viewport; no observer support = show immediately. */
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.lp-reveal'));
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -36px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* Nav highlight + back-to-top visibility. */
  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 560);
      let cur = 'top';
      NAV.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 130) cur = id;
      });
      setActive(cur);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">{t('a11y.skipToContent')}</a>

      {/* ------------------------- sticky glass header ------------------------ */}
      <header className="lp-nav" id="top">
        <Link to="/" className="brand lp-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">{t('app.name')}</span>
        </Link>

        <nav className="lp-nav-links" aria-label={t('home.featuresAria')}>
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`lp-nav-link${active === item.id ? ' active' : ''}`}
            >
              {t(item.label)}
            </a>
          ))}
        </nav>

        <div className="lp-nav-right">
          <ThemeToggle className="icon-btn lp-nav-icon" />
          <LocalePickers />
          <Link className="lp-nav-link lp-nav-signin" to="/login">{t('auth.signIn')}</Link>
          <Link className="btn btn-grad btn-sm" to="/register">{t('home.getStarted')}</Link>
        </div>
      </header>

      <main id="main-content">
        {/* ------------------------------ hero ------------------------------- */}
        <section className="lp2-hero" aria-label={t('home.previewAria')}>
          <div className="lp2-waves" aria-hidden="true" />

          <div className="lp2-hero-copy lp-reveal">
            <span className="lp2-badge">⚡ {t('home.badge')}</span>
            <h1>
              {t('home.heroL1')}
              <br />
              {t('home.heroL2')}
              <br />
              <span className="lp2-hero-accent">{t('home.heroL3')}</span>
            </h1>
            <p className="lp2-hero-sub">{t('home.heroSub')}</p>

            <div className="lp2-hero-cta">
              <Link className="btn btn-grad" to="/register">
                {t('home.startTracking')} <span aria-hidden="true">→</span>
              </Link>
              <a className="btn btn-glass" href="#overview">
                <span aria-hidden="true">▶</span> {t('home.watchDemo')}
              </a>
            </div>

            <ul className="lp2-trust">
              <li><span aria-hidden="true">⊕</span> {t('home.trustBank')}</li>
              <li><span aria-hidden="true">▶</span> {t('home.trustFree')}</li>
              <li><span aria-hidden="true">🔒</span> {t('home.trustSecure')}</li>
            </ul>
          </div>

          <div className="lp2-hero-visual lp-reveal">
            {/* phone: a static mock of the dark dashboard */}
            <div className="lp2-phone" role="img" aria-label={t('home.previewAria')}>
              <div className="pp-notch" aria-hidden="true" />
              <div className="pp-head">
                <span className="brand-mark pp-mark" aria-hidden="true">C</span>
                <strong>{t('app.name')}</strong>
                <span className="pp-avatar" aria-hidden="true">👩‍🎓</span>
              </div>
              <div className="pp-greet">
                <strong>{t('home.mockGreeting')}</strong>
                <span>{t('home.mockGreetingSub')}</span>
              </div>
              <div className="pp-total">
                <span className="pp-label"><span aria-hidden="true">🔒</span> {t('home.mockTotal')}</span>
                <strong>$1,240.50</strong>
                <span className="pp-chip">+12%</span>
              </div>
              <div className="pp-grid">
                <div className="pp-mini">
                  <span className="pp-ico g" aria-hidden="true">💵</span>
                  <span className="pp-label">{t('home.mockBalance')}</span>
                  <strong>$1,800.00</strong>
                </div>
                <div className="pp-mini">
                  <span className="pp-ico p" aria-hidden="true">💸</span>
                  <span className="pp-label">{t('home.mockExpense')}</span>
                  <strong>$559.50</strong>
                </div>
              </div>
              <div className="pp-section">
                <span className="pp-label"><span aria-hidden="true">📊</span> {t('home.mockOverview')}</span>
                <div className="pp-chart">
                  <span className="pp-donut" aria-hidden="true" />
                  <div className="pp-legend">
                    {PHONE_LEGEND.map((row) => (
                      <span key={row.key}>
                        <i className="dot" style={{ background: row.color }} aria-hidden="true" />
                        {t(row.key)} <b>{row.pct}%</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pp-tabs" aria-hidden="true">
                <span className="pp-tab active">⌂<em>{t('home.mockTabHome')}</em></span>
                <span className="pp-tab">⇄<em>{t('nav.transactions')}</em></span>
                <span className="pp-tab">◎<em>{t('nav.budgets')}</em></span>
                <span className="pp-tab">⋯<em>{t('home.mockMore')}</em></span>
              </div>
            </div>

            {/* floating glass cards */}
            <div className="lp2-float f1" aria-hidden="true">
              <span className="lp2-f-ico coin" >🪙</span>
              <div>
                <strong>+$500</strong>
                <span>{t('home.floatAllowanceT')}</span>
                <small>{t('home.floatAllowanceD')}</small>
              </div>
            </div>
            <div className="lp2-float f2" aria-hidden="true">
              <span className="lp2-f-ico">🍔</span>
              <div>
                <strong>{t('home.floatFoodT')} 72%</strong>
                <span className="lp2-f-track"><span style={{ width: '72%' }} /></span>
                <small>$180 / $250</small>
              </div>
            </div>
            <div className="lp2-float f3" aria-hidden="true">
              <span className="lp2-f-ico bulb">💡</span>
              <div>
                <strong>{t('home.floatSaveT')}</strong>
                <small>{t('home.floatSaveW')}</small>
                <span>{t('home.floatSaveS')}</span>
              </div>
            </div>

            <div className="lp2-hand hp1" aria-hidden="true">
              {t('home.handSteps')}
              <svg viewBox="0 0 60 34" className="lp2-hand-arrow"><path d="M2 4 C 22 2, 46 8, 54 26 M46 24 l9 4 -3 -10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </div>
          </div>
        </section>

        {/* ---------------------------- stats band --------------------------- */}
        <section className="lp2-stats lp-reveal" aria-label={t('home.stat3b')}>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s1" aria-hidden="true">⚡</span>
            <div><strong>{t('home.stat1a')}</strong><span>{t('home.stat1b')}</span></div>
          </div>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s2" aria-hidden="true">📅</span>
            <div><strong>{t('home.stat2a')}</strong><span>{t('home.stat2b')}</span></div>
          </div>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s3" aria-hidden="true">🟩</span>
            <div><strong>{t('home.stat3a')}</strong><span>{t('home.stat3b')}</span></div>
          </div>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s4" aria-hidden="true">🛡️</span>
            <div><strong>{t('home.stat4a')}</strong><span>{t('home.stat4b')}</span></div>
          </div>
        </section>

        {/* ---------------------------- features ----------------------------- */}
        <section id="features" className="lp2-section lp2-features" aria-label={t('home.featuresAria')}>
          <div className="lp2-feat-head lp-reveal">
            <span className="lp2-eyebrow">{t('home.featEyebrow')}</span>
            <h2>{t('home.featTitle')}</h2>
            <p>{t('home.featSub')}</p>
            <Link className="btn btn-dark" to="/register">
              {t('home.exploreFeatures')} <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="lp2-feat-grid">
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '60ms' }}>
              <span className="lp2-f-ico t1" aria-hidden="true">💳</span>
              <h3>{t('home.f1t')}</h3>
              <p>{t('home.f1b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '120ms' }}>
              <span className="lp2-f-ico t2" aria-hidden="true">🎯</span>
              <h3>{t('home.f2t')}</h3>
              <p>{t('home.f2b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '180ms' }}>
              <span className="lp2-f-ico t3" aria-hidden="true">📊</span>
              <h3>{t('home.f3t')}</h3>
              <p>{t('home.f3b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '240ms' }}>
              <span className="lp2-f-ico t4" aria-hidden="true">💡</span>
              <h3>{t('home.f4t')}</h3>
              <p>{t('home.f4b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '300ms' }}>
              <span className="lp2-f-ico t5" aria-hidden="true">✨</span>
              <h3>
                {t('home.f5t')} <em className="lp2-optional">{t('home.optionalTag')}</em>
              </h3>
              <p>{t('home.f5b')}</p>
              <span className="lp2-fcard-arrow" aria-hidden="true">→</span>
            </article>
          </div>
        </section>

        {/* ------------------------ financial overview ----------------------- */}
        <section id="overview" className="lp2-section lp2-overview">
          <div className="lp2-ov-copy lp-reveal">
            <span className="lp2-eyebrow">{t('home.ovEyebrow')}</span>
            <h2>{t('home.ovTitle')}</h2>
            <p>{t('home.ovSub')}</p>
            <ul className="lp2-check-list">
              <li><span aria-hidden="true">✓</span> {t('home.ovC1')}</li>
              <li><span aria-hidden="true">✓</span> {t('home.ovC2')}</li>
              <li><span aria-hidden="true">✓</span> {t('home.ovC3')}</li>
              <li><span aria-hidden="true">✓</span> {t('home.ovC4')}</li>
            </ul>
            <Link className="btn btn-outline-dark" to="/dashboard">
              {t('home.ovBtn')} <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="lp2-ov-visual lp-reveal">
            {/* light dashboard mock */}
            <div className="lp2-dash" role="img" aria-label={t('home.previewAria')}>
              <aside className="lp2-dash-side">
                <div className="lp2-ds-brand">
                  <span className="brand-mark" aria-hidden="true">C</span>
                  <strong>{t('app.name')}</strong>
                </div>
                <span className="lp2-ds-link active"><span aria-hidden="true">🏠</span> {t('nav.dashboard')}</span>
                <span className="lp2-ds-link"><span aria-hidden="true">🧾</span> {t('nav.transactions')}</span>
                <span className="lp2-ds-link"><span aria-hidden="true">◎</span> {t('nav.budgets')}</span>
                <span className="lp2-ds-link"><span aria-hidden="true">📈</span> {t('nav.reports')}</span>
                <span className="lp2-ds-link"><span aria-hidden="true">💡</span> {t('home.link.savingTips')}</span>
                <span className="lp2-ds-link"><span aria-hidden="true">🏷️</span> {t('nav.categories')}</span>
                <span className="lp2-ds-link"><span aria-hidden="true">⚙️</span> {t('home.section.settings')}</span>
              </aside>
              <div className="lp2-dash-main">
                <div className="lp2-dm-head">
                  <div>
                    <strong>{t('home.mockGreeting')}</strong>
                    <span>{t('home.ovDashSub')}</span>
                  </div>
                  <span className="lp2-dm-avatar" aria-hidden="true">👩‍🎓</span>
                </div>
                <div className="lp2-dm-stats">
                  <div className="lp2-dm-stat">
                    <span className="lp2-f-ico t1" aria-hidden="true">💵</span>
                    <div><small>{t('home.mockBalance')}</small><strong>$1,240.50</strong></div>
                  </div>
                  <div className="lp2-dm-stat">
                    <span className="lp2-f-ico t1" aria-hidden="true">📈</span>
                    <div><small>{t('home.mockIncome')}</small><strong className="lp-green">$1,800.00</strong></div>
                  </div>
                  <div className="lp2-dm-stat">
                    <span className="lp2-f-ico t5" aria-hidden="true">💸</span>
                    <div><small>{t('home.mockExpense')}</small><strong className="lp-pink">$559.50</strong></div>
                  </div>
                </div>
                <div className="lp2-dm-charts">
                  <div className="lp2-dm-card">
                    <strong className="pp-label">{t('home.mockOverview')}</strong>
                    <div className="lp2-bars" aria-hidden="true">
                      {[42, 58, 46, 74, 62, 88, 70, 96, 64].map((h, i) => (
                        <span key={i} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="lp2-months" aria-hidden="true">
                      <span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span>
                    </div>
                  </div>
                  <div className="lp2-dm-card">
                    <strong className="pp-label">{t('home.mockTopCats')}</strong>
                    <div className="lp2-topcats">
                      {PHONE_LEGEND.map((row) => (
                        <span key={row.key}>
                          <i className="dot" style={{ background: row.color }} aria-hidden="true" />
                          {t(row.key)} <b>{row.pct}%</b>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* phone: budgets screen */}
            <div className="lp2-mphone" aria-hidden="true">
              <div className="mp-title">{t('nav.budgets')}</div>
              <div className="mp-row">
                <span className="mp-ico t1">🍔</span>
                <div>
                  <strong>{t('home.catFood')}</strong>
                  <small>$180 / $250</small>
                  <span className="mp-track"><span style={{ width: '72%' }} /></span>
                </div>
                <b>72%</b>
              </div>
              <div className="mp-row">
                <span className="mp-ico t3">🚌</span>
                <div>
                  <strong>{t('home.catTransport')}</strong>
                  <small>$80 / $180</small>
                  <span className="mp-track"><span style={{ width: '44%' }} /></span>
                </div>
                <b>44%</b>
              </div>
              <div className="mp-row">
                <span className="mp-ico t2">🏠</span>
                <div>
                  <strong>{t('home.catHostel')}</strong>
                  <small>$500 / $640</small>
                  <span className="mp-track"><span style={{ width: '58%' }} /></span>
                </div>
                <b>58%</b>
              </div>
              <div className="mp-row">
                <span className="mp-ico t4">📚</span>
                <div>
                  <strong>{t('home.catAcademics')}</strong>
                  <small>$40 / $100</small>
                  <span className="mp-track"><span style={{ width: '40%' }} /></span>
                </div>
                <b>40%</b>
              </div>
              <div className="mp-tabs">
                <span>⌂</span><span>⇄</span><span className="active">◎</span><span>⋯</span>
              </div>
            </div>

            <div className="lp2-hand hp2" aria-hidden="true">
              {t('home.handMobile')}
              <svg viewBox="0 0 60 34" className="lp2-hand-arrow flip"><path d="M58 4 C 38 2, 14 8, 6 26 M14 24 l-9 4 3 -10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </div>
          </div>
        </section>

        {/* -------------------------- smart features ------------------------- */}
        <section className="lp2-section lp2-smart">
          <div className="lp2-smart-head lp-reveal">
            <span className="lp2-eyebrow">{t('home.smartEyebrow')}</span>
            <h2>{t('home.smartTitle')}</h2>
          </div>

          <div className="lp2-smart-grid">
            {/* suggestion demo */}
            <div className="lp2-sugcard lp-reveal" style={{ transitionDelay: '60ms' }}>
              <div className="lp2-receipt">
                <span aria-hidden="true">🧾</span>
                <div>
                  <strong>{t('home.sugShop')}</strong>
                  <small>2 Sep · 1:40 PM</small>
                </div>
              </div>
              <div className="lp2-sugbox">
                <span className="lp2-suglabel"><span aria-hidden="true">✨</span> {t('home.sugLabel')}</span>
                <div className="lp2-sugrow">
                  <span className="mp-ico t4">🍔</span>
                  <div>
                    <strong>{t('home.catFood')}</strong>
                    <small>{t('home.sugConf')}</small>
                  </div>
                </div>
                <div className="lp2-sugbtns">
                  <span className="lp2-mini-btn solid">{t('home.sugAccept')}</span>
                  <span className="lp2-mini-btn">{t('home.sugChange')}</span>
                </div>
              </div>
            </div>

            <div className="lp2-smart-text lp-reveal" style={{ transitionDelay: '120ms' }}>
              <h3>{t('home.sugTitle')}</h3>
              <p>{t('home.sugBody')}</p>
              <Link className="lp2-inline-link" to="/register">
                {t('home.sugHow')} <span aria-hidden="true">→</span>
              </Link>
            </div>

            {/* saving tips */}
            <article className="lp2-tipcard lp-reveal" style={{ transitionDelay: '180ms' }}>
              <span className="lp2-f-ico t4" aria-hidden="true">💡</span>
              <h3>{t('home.tipCardT')}</h3>
              <p>{t('home.tipDemo')}</p>
              <strong className="lp2-saving">{t('home.tipPotential')}</strong>
              <div className="lp2-sugbtns">
                <span className="lp2-mini-btn solid">{t('home.tipSave')}</span>
                <span className="lp2-mini-btn">{t('home.tipDismiss')}</span>
              </div>
            </article>

            {/* reports */}
            <article className="lp2-repcard lp-reveal" style={{ transitionDelay: '240ms' }}>
              <span className="lp2-f-ico t3" aria-hidden="true">📈</span>
              <h3>{t('home.repCardT')}</h3>
              <div className="lp2-minicharts" aria-hidden="true">
                <div className="lp2-mbars">
                  <span style={{ height: '46%' }} /><span style={{ height: '74%' }} />
                  <span style={{ height: '56%' }} /><span style={{ height: '88%' }} />
                  <span style={{ height: '64%' }} />
                </div>
                <span className="lp2-mdonut" />
              </div>
              <strong>{t('home.repTitle')}</strong>
              <p>{t('home.repBody')}</p>
              <Link className="lp2-inline-link" to="/register">
                {t('home.repBtn')} <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </section>

        {/* --------------------------- categories ---------------------------- */}
        <section className="lp2-section lp2-cats">
          <div className="lp2-cats-copy lp-reveal">
            <span className="lp2-eyebrow">{t('home.catsEyebrow')}</span>
            <h2>{t('home.catsTitle')}</h2>
            <p>{t('home.catsSub')}</p>
            <div className="lp2-catpills">
              {[
                { icon: '🍔', key: 'home.catFood', cls: 't4' },
                { icon: '🚌', key: 'home.catTransport', cls: 't3' },
                { icon: '🏠', key: 'home.catHostel', cls: 't5' },
                { icon: '📚', key: 'home.catAcademics', cls: 't1' },
                { icon: '🎮', key: 'home.catEntertainment', cls: 't2' },
                { icon: '💳', key: 'home.catSubs', cls: 't3' },
              ].map((c) => (
                <span key={c.key} className="lp2-catpill">
                  <span className={`lp2-f-ico ${c.cls}`} aria-hidden="true">{c.icon}</span>
                  {t(c.key)}
                </span>
              ))}
            </div>
          </div>

          <div className="lp2-cats-photo lp-reveal" role="img" aria-label={t('home.handDreams')}>
            {/* flat SVG scene: campus at golden hour, student from behind */}
            <svg viewBox="0 0 460 300" className="lp2-scene" aria-hidden="true">
              <defs>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffd9a0" />
                  <stop offset="0.55" stopColor="#f6b98a" />
                  <stop offset="1" stopColor="#e98f7e" />
                </linearGradient>
                <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#3f6b57" />
                  <stop offset="1" stopColor="#274a3c" />
                </linearGradient>
              </defs>
              <rect width="460" height="300" fill="url(#sky)" />
              <circle cx="352" cy="86" r="38" fill="#ffe9b0" opacity="0.9" />
              {/* campus buildings */}
              <g fill="#7b5b52">
                <rect x="24" y="118" width="132" height="118" />
                <rect x="164" y="150" width="74" height="86" />
                <polygon points="90,74 24,118 156,118" />
              </g>
              <g fill="#f7e3cf" opacity="0.85">
                <rect x="42" y="138" width="18" height="24" /><rect x="72" y="138" width="18" height="24" />
                <rect x="102" y="138" width="18" height="24" /><rect x="42" y="176" width="18" height="24" />
                <rect x="72" y="176" width="18" height="24" /><rect x="102" y="176" width="18" height="24" />
                <rect x="178" y="168" width="16" height="22" /><rect x="204" y="168" width="16" height="22" />
                <rect x="178" y="200" width="16" height="22" /><rect x="204" y="200" width="16" height="22" />
              </g>
              {/* trees */}
              <g>
                <circle cx="418" cy="176" r="34" fill="#2f5d49" />
                <rect x="412" y="196" width="12" height="42" fill="#5a4032" />
                <circle cx="262" cy="196" r="24" fill="#376a53" />
                <rect x="257" y="210" width="9" height="30" fill="#5a4032" />
              </g>
              <rect y="236" width="460" height="64" fill="url(#ground)" />
              <path d="M0 260 Q 230 236 460 262 L460 300 L0 300 Z" fill="#2b5243" />
              {/* student, seen from behind */}
              <g>
                <rect x="236" y="196" width="52" height="70" rx="16" fill="#37558f" />
                <rect x="244" y="206" width="36" height="46" rx="12" fill="#4a6bb5" />
                <circle cx="262" cy="180" r="17" fill="#3a2b25" />
                <path d="M247 182 a15 15 0 0 1 30 0" fill="#241a16" />
                <rect x="240" y="262" width="16" height="34" rx="6" fill="#26303f" />
                <rect x="268" y="262" width="16" height="34" rx="6" fill="#26303f" />
              </g>
            </svg>
            <div className="lp2-hand hp3" aria-hidden="true">{t('home.handDreams')}</div>
          </div>
        </section>

        {/* ----------------------------- privacy ----------------------------- */}
        <section className="lp2-privacy lp-reveal" id="privacy">
          <div className="lp2-priv-left">
            <span className="lp2-shield" aria-hidden="true">🛡️</span>
            <div>
              <span className="lp2-eyebrow">{t('home.privEyebrow')}</span>
              <h2>{t('home.privTitle')}</h2>
              <p>{t('home.privBody')}</p>
            </div>
          </div>
          <ul className="lp2-priv-list">
            <li><span aria-hidden="true">✓</span> {t('home.privC1')}</li>
            <li><span aria-hidden="true">✓</span> {t('home.privC2')}</li>
            <li><span aria-hidden="true">✓</span> {t('home.privC3')}</li>
            <li><span aria-hidden="true">✓</span> {t('home.privC4')}</li>
            <li><span aria-hidden="true">✓</span> {t('home.privC5')}</li>
          </ul>
        </section>

        {/* -------------------------- how it works --------------------------- */}
        <section id="how" className="lp-how lp2-section" aria-labelledby="how-heading">
          <span className="lp2-eyebrow">{t('home.nav.how')}</span>
          <h2 id="how-heading">{t('home.howTitle')}</h2>
          <ol className="lp-steps">
            <li className="lp-step lp-reveal" style={{ transitionDelay: '60ms' }}>
              <span className="lp-step-num n1" aria-hidden="true">1</span>
              <h3>{t('home.step1Title')}</h3>
              <p>{t('home.step1Text')}</p>
            </li>
            <li className="lp-step lp-reveal" style={{ transitionDelay: '140ms' }}>
              <span className="lp-step-num n2" aria-hidden="true">2</span>
              <h3>{t('home.step2Title')}</h3>
              <p>{t('home.step2Text')}</p>
            </li>
            <li className="lp-step lp-reveal" style={{ transitionDelay: '220ms' }}>
              <span className="lp-step-num n3" aria-hidden="true">3</span>
              <h3>{t('home.step3Title')}</h3>
              <p>{t('home.step3Text')}</p>
            </li>
          </ol>
        </section>

        {/* ------------------------------- faq ------------------------------- */}
        <section id="faq" className="lp2-section lp2-faq" aria-labelledby="faq-heading">
          <span className="lp2-eyebrow">{t('home.nav.faq')}</span>
          <h2 id="faq-heading">{t('home.faqTitle')}</h2>
          <div className="lp2-faq-list">
            {[1, 2, 3, 4, 5].map((n) => (
              <details key={n} className="faq-item lp-reveal" style={{ transitionDelay: `${n * 50}ms` }}>
                <summary className="faq-q">{t(`home.faqQ${n}`)}<span aria-hidden="true">＋</span></summary>
                <p className="faq-a">{t(`home.faqA${n}`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* -------------------------- closing banner ------------------------- */}
        <section className="lp2-cta lp-reveal">
          <span className="lp2-cta-coin" aria-hidden="true">
            <span className="brand-mark">C</span>
          </span>
          <div className="lp2-cta-copy">
            <h2>{t('home.cta2Title')}</h2>
            <p>{t('home.cta2Sub')}</p>
          </div>
          <div className="lp2-cta-btns">
            <Link className="btn btn-grad" to="/register">
              {t('home.getStarted')} <span aria-hidden="true">→</span>
            </Link>
            <small>{t('home.cta2Note')}</small>
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

      {/* ------------------------------ footer ------------------------------- */}
      <footer className="lp2-footer">
        <div className="lp2-foot-grid">
          <div className="lp2-foot-brand">
            <Link to="/" className="brand">
              <span className="brand-mark" aria-hidden="true">C</span>
              <span className="brand-name">{t('app.name')}</span>
            </Link>
            <strong className="lp2-foot-tag">{t('home.heroTitle')}</strong>
            <p>{t('home.footerBlurb')}</p>
            <p className="muted smallish">{t('home.footerDisclaimer')}</p>
          </div>

          <nav className="lp2-foot-col" aria-label={t('home.footQuick')}>
            <h3>{t('home.footQuick')}</h3>
            <a href="#top">{t('home.nav.home')}</a>
            <a href="#features">{t('home.nav.features')}</a>
            <a href="#how">{t('home.nav.how')}</a>
            <a href="#overview">{t('home.nav.insights')}</a>
            <a href="#faq">{t('home.nav.faq')}</a>
          </nav>

          <nav className="lp2-foot-col" aria-label={t('home.footLegal')}>
            <h3>{t('home.footLegal')}</h3>
            <a href="#privacy">{t('home.footPrivacy')}</a>
            <a href="#faq">{t('home.footTerms')}</a>
            <a href="#faq">{t('home.footContact')}</a>
          </nav>

          <div className="lp2-foot-col">
            <h3>{t('home.footFollow')}</h3>
            <div className="lp2-social">
              <a href="#top" aria-label={t('home.socialIg')} title={t('home.socialIg')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" /></svg>
              </a>
              <a href="#top" aria-label={t('home.socialX')} title={t('home.socialX')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </a>
              <a href="#top" aria-label={t('home.socialYt')} title={t('home.socialYt')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" /></svg>
              </a>
              <a href="#top" aria-label={t('home.socialLi')} title={t('home.socialLi')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M7.5 10.5v6M7.5 7.6v.1M11.5 16.5v-6M11.5 13c0-1.6 1.1-2.6 2.6-2.6s2.6 1 2.6 2.9v3.2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
              </a>
            </div>
          </div>
        </div>

        <div className="lp2-foot-bottom">
          <span>{t('home.footRights')}</span>
          <span>{t('home.footBuilt')}</span>
        </div>
      </footer>

      <button
        type="button"
        className={`lp2-topbtn${showTop ? ' show' : ''}`}
        onClick={toTop}
        aria-label={t('home.backToTop')}
        title={t('home.backToTop')}
        tabIndex={showTop ? 0 : -1}
      >
        <span aria-hidden="true">↑</span>
      </button>
    </div>
  );
}
