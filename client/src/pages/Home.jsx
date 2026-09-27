import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Login from './Login.jsx';
import Register from './Register.jsx';
import AdminLogin from './AdminLogin.jsx';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import LocalePickers from '../components/LocalePickers.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Icon from '../components/Icon.jsx';
import HeroWaves from '../components/art/HeroWaves.jsx';
import HeroShowcase from '../components/art/HeroShowcase.jsx';
import FaqArt from '../components/art/FaqArt.jsx';
import CatsArt from '../components/art/CatsArt.jsx';

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
/**
 * The links, in the order the page actually reads: home, what it does, the rooms
 * money lives in, insights, how it works, questions. Insights comes before
 * How-it-works because that is the order the sections are in - when the two
 * disagreed, the highlight followed the list and lit up the wrong link.
 */
/**
 * How far below the top of the page a section should land when its link is
 * clicked. The landing header is fixed, so a plain anchor would put the
 * section's heading underneath it - which is what made a click look like it
 * had gone somewhere else. Measured from the header itself rather than
 * hard-coded, because the header is taller on a narrow phone where it wraps.
 */
const HEADER_OFFSET = 96;

const NAV = [
  { id: 'top', label: 'home.nav.home' },
  { id: 'features', label: 'home.nav.features' },
  { id: 'rooms', label: 'home.nav.rooms' },
  { id: 'overview', label: 'home.nav.insights' },
  { id: 'how', label: 'home.nav.how' },
  { id: 'faq', label: 'home.nav.faq' },
];

const PHONE_LEGEND = [
  { key: 'home.catFood', pct: 38, color: '#f5b400', icon: 'burger' },
  { key: 'home.catTransport', pct: 16, color: '#14b8a6', icon: 'bus' },
  { key: 'home.catHostel', pct: 15, color: '#2563eb', icon: 'house' },
  { key: 'home.catAcademics', pct: 12, color: '#7c3aed', icon: 'books' },
  { key: 'home.catEntertainment', pct: 10, color: '#db2777', icon: 'gamepad' },
  { key: 'home.catOther', pct: 9, color: '#64748b', icon: 'dots' },
];

/**
 * The form that stands in for the landing page, inside the landing page.
 *
 * One component for three forms, because they are three answers to the same
 * question and have to look and behave the same: a card in the middle of the
 * page, the landing header still above it and the landing footer still below
 * it, and no second copy of any form.
 *
 * `onSwitch` is what makes the cross-links inside the forms ("create an
 * account", the staff door) swap the panel instead of navigating away - which
 * is the whole reason for opening a form here rather than on its own page.
 */
function AuthPanel({ which, onClose, onSwitch }) {
  const shared = { embedded: true, onClose, onSwitch };

  if (which === 'register') return <Register {...shared} />;
  if (which === 'admin') return <AdminLogin {...shared} />;
  return <Login {...shared} />;
}

export default function Home() {
  const { t } = useLocale();
  const { user, loading, logout } = useAuth() || {};
  const [active, setActive] = useState('top');

  /* The sign-in panel, held in the URL so Back and a refresh behave.
     `null` means the landing page; anything else is the form to show. */
  const [params, setParams] = useSearchParams();
  const panel = params.get('panel');

  /** Open a form in place of the landing content. */
  function openPanel(which) {
    setParams({ panel: which });
  }

  /** Close it and put the landing page back, exactly as it was. */
  function closePanel() {
    setParams({}, { replace: false });
  }

  /**
   * A cross-link inside a form - "create an account", the staff door - asks for a
   * path. When the form is on the landing page that path is turned into a panel
   * instead of a navigation, so the reader never leaves the page.
   */
  function switchTo(path) {
    const map = { '/login': 'login', '/register': 'register', '/control/login': 'admin' };
    if (map[path]) openPanel(map[path]);
  }
  const [showTop, setShowTop] = useState(false);
  const [stuck, setStuck] = useState(false);

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

  /* Nav highlight + back-to-top visibility (+ header glass when scrolled). */
  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 560);
      setStuck(window.scrollY > 8);

      // The section whose top has passed the header, and which is the NEAREST one
      // to it. Walking the link list in order and keeping the last match is what
      // put the underline under the wrong link: the answer depended on the order
      // the links were written in rather than on where the reader is.
      const MARK = 130;
      let cur = 'top';
      let best = -Infinity;
      for (const { id } of NAV) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= MARK && top > best) {
          best = top;
          cur = id;
        }
      }
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

      {/* Anchor for the "Home" nav link — the header itself is position:fixed
          and cannot be a scroll target. */}
      <span id="top" aria-hidden="true" />

      {/* ------------------------- sticky glass header ------------------------ */}
      {/* A panel is a white page, and this header is drawn for a dark hero:
          without `is-panel` every word in it would be mint on white. */}
      <header className={`lp-nav${stuck ? ' is-stuck' : ''}${panel ? ' is-panel' : ''}`}>
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
              aria-current={active === item.id ? 'true' : undefined}
              onClick={(e) => {
                // With a form open there are no sections to scroll to yet, so the
                // panel closes first and the scroll happens on the next frame.
                if (panel) {
                  e.preventDefault();
                  closePanel();
                  window.requestAnimationFrame(() => {
                    const target = document.getElementById(item.id);
                    if (target) {
                      window.scrollTo({
                        top: item.id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET,
                        behavior: 'smooth',
                      });
                    }
                  });
                  return;
                }
                // The header is fixed, so a plain anchor would put the section's
                // heading underneath it. Land on the section's own offset
                // instead, and mark the link the reader is on for anything that
                // is not CSS (a screen reader, a print stylesheet).
                const el = document.getElementById(item.id);
                if (!el) return;
                e.preventDefault();
                const top = item.id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
                window.scrollTo({ top, behavior: 'smooth' });
                window.history.replaceState(null, '', `#${item.id}`);
                setActive(item.id);
              }}
            >
              {t(item.label)}
            </a>
          ))}
        </nav>

        <div className="lp-nav-right">
          <ThemeToggle className="icon-btn lp-nav-icon" />
          <LocalePickers variant="nav" />
          {loading ? null : user ? (
            <>
              {/* Signed in: the board's Sign in / Get started pair becomes
                  Sign out + a way straight back into the visitor's own app. */}
              <button
                type="button"
                className="lp-nav-link lp-nav-signin"
                onClick={async () => { await logout(); }}
              >
                {t('account.signOut')}
              </button>
              <Link
                className="btn btn-grad btn-sm"
                to={user.role === 'admin' ? '/control' : '/dashboard'}
              >
                {user.role === 'admin' ? t('home.adminPanel') : t('nav.dashboard')}
              </Link>
            </>
          ) : (
            <>
              {/* Both open here, not on another page. Buttons, not links: a
                  link would promise a URL, and there is not one - the panel is
                  a state of this page, and a link that pretends otherwise is a
                  broken promise the moment somebody middle-clicks it. */}
              <button
                type="button"
                className="lp-nav-link lp-nav-signin"
                onClick={() => openPanel('login')}
              >
                {t('auth.signIn')}
              </button>
              <button type="button" className="btn btn-grad btn-sm" onClick={() => openPanel('register')}>
                {t('home.getStarted')}
              </button>
            </>
          )}
        </div>
      </header>

      <main id="main-content" className={panel ? 'landing-main is-panel' : 'landing-main'}>
        {/* A form opened from the header replaces the page, not the frame: the
            navbar above and the footer below stay exactly where they were. */}
        {panel ? (
          <AuthPanel which={panel} onClose={closePanel} onSwitch={switchTo} />
        ) : (
          <>
        {/* ------------------------------ hero ------------------------------- */}
        <section className="lp2-hero" aria-label={t('home.previewAria')}>
          <HeroWaves />

          <div className="lp2-hero-copy lp-reveal">
            <span className="lp2-badge"><Icon name="bolt" /> {t('home.badge')}</span>
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
                {t('home.startTracking')} <Icon name="arrowRight" />
              </Link>
              <a className="btn btn-glass" href="#overview">
                <Icon name="play" /> {t('home.watchDemo')}
              </a>
            </div>

            <ul className="lp2-trust">
              <li><Icon name="plusCircle" /> {t('home.trustBank')}</li>
              <li><Icon name="play" /> {t('home.trustFree')}</li>
              <li><Icon name="lock" /> {t('home.trustSecure')}</li>
            </ul>
          </div>

          {/* the picture side of the hero: the phone that bobs, the converter
              popover over it, the coin and the notes. One component, because it
              is one picture and not a page. */}
          <HeroShowcase className="lp-reveal" />
        </section>

        {/* ---------------------------- stats band --------------------------- */}
        <section className="lp2-stats lp-reveal" aria-label={t('home.stat3b')}>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s1"><Icon name="bolt" /></span>
            <div><strong>{t('home.stat1a')}</strong><span>{t('home.stat1b')}</span></div>
          </div>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s2"><Icon name="calendar" /></span>
            <div><strong>{t('home.stat2a')}</strong><span>{t('home.stat2b')}</span></div>
          </div>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s3"><Icon name="grid" /></span>
            <div><strong>{t('home.stat3a')}</strong><span>{t('home.stat3b')}</span></div>
          </div>
          <div className="lp2-stat">
            <span className="lp2-stat-ico s4"><Icon name="shield" /></span>
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
              {t('home.exploreFeatures')} <Icon name="arrowRight" />
            </Link>
          </div>

          <div className="lp2-feat-grid">
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '60ms' }}>
              <span className="lp2-f-ico t1"><Icon name="card" /></span>
              <h3>{t('home.f1t')}</h3>
              <p>{t('home.f1b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '120ms' }}>
              <span className="lp2-f-ico t2"><Icon name="target" /></span>
              <h3>{t('home.f2t')}</h3>
              <p>{t('home.f2b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '180ms' }}>
              <span className="lp2-f-ico t3"><Icon name="chart" /></span>
              <h3>{t('home.f3t')}</h3>
              <p>{t('home.f3b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '240ms' }}>
              <span className="lp2-f-ico t4"><Icon name="bulb" /></span>
              <h3>{t('home.f4t')}</h3>
              <p>{t('home.f4b')}</p>
            </article>
            <article className="lp2-fcard lp-reveal" style={{ transitionDelay: '300ms' }}>
              <span className="lp2-f-ico t5"><Icon name="sparkles" /></span>
              <h3>
                {t('home.f5t')} <em className="lp2-optional">{t('home.optionalTag')}</em>
              </h3>
              <p>{t('home.f5b')}</p>
              <span className="lp2-fcard-arrow"><Icon name="arrowRight" /></span>
            </article>
          </div>
        </section>

        {/* --------------- standout tools (the five advanced features) ------- */}
        <section id="standout" className="lp2-section lp2-standout" aria-labelledby="standout-heading">
          <div className="lp2-standout-head lp-reveal">
            <span className="lp2-eyebrow">{t('home.standoutEyebrow')}</span>
            <h2 id="standout-heading">{t('home.standoutTitle')}</h2>
            <p>{t('home.standoutSub')}</p>
          </div>

          <div className="lp2-standout-grid">
            <article className="lp2-scard lp-reveal" style={{ transitionDelay: '60ms' }}>
              <span className="lp2-f-ico t1"><Icon name="users" /></span>
              <h3>{t('home.s1t')}</h3>
              <p>{t('home.s1b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </article>
            <article className="lp2-scard lp-reveal" style={{ transitionDelay: '120ms' }}>
              <span className="lp2-f-ico t2"><Icon name="bolt" /></span>
              <h3>{t('home.s2t')}</h3>
              <p>{t('home.s2b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </article>
            <article className="lp2-scard lp-reveal" style={{ transitionDelay: '180ms' }}>
              <span className="lp2-f-ico t3"><Icon name="hourglass" /></span>
              <h3>{t('home.s3t')}</h3>
              <p>{t('home.s3b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </article>
            <article className="lp2-scard lp-reveal" style={{ transitionDelay: '240ms' }}>
              <span className="lp2-f-ico t4"><Icon name="gift" /></span>
              <h3>{t('home.s4t')}</h3>
              <p>{t('home.s4b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </article>
            <article className="lp2-scard lp-reveal" style={{ transitionDelay: '300ms' }}>
              <span className="lp2-f-ico t5"><Icon name="shield" /></span>
              <h3>{t('home.s5t')}</h3>
              <p>{t('home.s5b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </article>
          </div>
        </section>

        {/* ----------------- the utility rooms (Tier 4) ---------------------- */}
        <section id="rooms" className="lp2-section lp2-standout" aria-labelledby="rooms-heading">
          <div className="lp2-standout-head lp-reveal">
            <span className="lp2-eyebrow">{t('home.roomsEyebrow')}</span>
            <h2 id="rooms-heading">{t('home.roomsTitle')}</h2>
            <p>{t('home.roomsSub')}</p>
          </div>

          <div className="lp2-standout-grid lp2-rooms-grid">
            <Link to="/savings-options" className="lp2-scard lp2-scard-link lp-reveal">
              <span className="lp2-f-ico t4"><Icon name="piggy" /></span>
              <h3>{t('home.room1t')}</h3>
              <p>{t('home.room1b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </Link>
            <Link to="/grow-money" className="lp2-scard lp2-scard-link lp-reveal" style={{ transitionDelay: '80ms' }}>
              <span className="lp2-f-ico t3"><Icon name="trophy" /></span>
              <h3>{t('home.room2t')}</h3>
              <p>{t('home.room2b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </Link>
            <Link to="/side-income" className="lp2-scard lp2-scard-link lp-reveal" style={{ transitionDelay: '160ms' }}>
              <span className="lp2-f-ico t2"><Icon name="briefcase" /></span>
              <h3>{t('home.room3t')}</h3>
              <p>{t('home.room3b')}</p>
              <span className="lp2-scard-arrow"><Icon name="arrowRight" /></span>
            </Link>
          </div>
        </section>

        {/* ------------------------ financial overview ----------------------- */}
        <section id="overview" className="lp2-section lp2-overview">
          <div className="lp2-ov-copy lp-reveal">
            <span className="lp2-eyebrow">{t('home.ovEyebrow')}</span>
            <h2>{t('home.ovTitle')}</h2>
            <p>{t('home.ovSub')}</p>
            <ul className="lp2-check-list">
              <li><Icon name="check" /> {t('home.ovC1')}</li>
              <li><Icon name="check" /> {t('home.ovC2')}</li>
              <li><Icon name="check" /> {t('home.ovC3')}</li>
              <li><Icon name="check" /> {t('home.ovC4')}</li>
            </ul>
            <Link className="btn btn-outline-dark" to="/dashboard">
              {t('home.ovBtn')} <Icon name="arrowRight" />
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
                <span className="lp2-ds-link active"><Icon name="home" /> {t('nav.dashboard')}</span>
                <span className="lp2-ds-link"><Icon name="receipt" /> {t('nav.transactions')}</span>
                <span className="lp2-ds-link"><Icon name="target" /> {t('nav.budgets')}</span>
                <span className="lp2-ds-link"><Icon name="chartUp" /> {t('nav.reports')}</span>
                <span className="lp2-ds-link"><Icon name="bulb" /> {t('home.link.savingTips')}</span>
                <span className="lp2-ds-link"><Icon name="tag" /> {t('nav.categories')}</span>
                <span className="lp2-ds-link"><Icon name="settings" /> {t('home.section.settings')}</span>
              </aside>
              <div className="lp2-dash-main">
                <div className="lp2-dm-head">
                  <div>
                    <strong>{t('home.mockGreeting')}</strong>
                    <span>{t('home.ovDashSub')}</span>
                  </div>
                  <span className="lp2-dm-avatar"><Icon name="student" size={20} /></span>
                </div>
                <div className="lp2-dm-stats">
                  <div className="lp2-dm-stat">
                    <span className="lp2-f-ico t1"><Icon name="cash" /></span>
                    <div><small>{t('home.mockBalance')}</small><strong>$1,240.50</strong></div>
                  </div>
                  <div className="lp2-dm-stat">
                    <span className="lp2-f-ico t1"><Icon name="trendUp" /></span>
                    <div><small>{t('home.mockIncome')}</small><strong className="lp-green">$1,800.00</strong></div>
                  </div>
                  <div className="lp2-dm-stat">
                    <span className="lp2-f-ico t5"><Icon name="trendDown" /></span>
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
                <span className="mp-ico t1"><Icon name="burger" /></span>
                <div>
                  <strong>{t('home.catFood')}</strong>
                  <small>$180 / $250</small>
                  <span className="mp-track"><span style={{ width: '72%' }} /></span>
                </div>
                <b>72%</b>
              </div>
              <div className="mp-row">
                <span className="mp-ico t3"><Icon name="bus" /></span>
                <div>
                  <strong>{t('home.catTransport')}</strong>
                  <small>$80 / $180</small>
                  <span className="mp-track"><span style={{ width: '44%' }} /></span>
                </div>
                <b>44%</b>
              </div>
              <div className="mp-row">
                <span className="mp-ico t2"><Icon name="house" /></span>
                <div>
                  <strong>{t('home.catHostel')}</strong>
                  <small>$500 / $640</small>
                  <span className="mp-track"><span style={{ width: '58%' }} /></span>
                </div>
                <b>58%</b>
              </div>
              <div className="mp-row">
                <span className="mp-ico t4"><Icon name="books" /></span>
                <div>
                  <strong>{t('home.catAcademics')}</strong>
                  <small>$40 / $100</small>
                  <span className="mp-track"><span style={{ width: '40%' }} /></span>
                </div>
                <b>40%</b>
              </div>
              <div className="mp-tabs">
                <Icon name="home" /><Icon name="repeat" /><span className="active"><Icon name="target" /></span><Icon name="more" />
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
                <Icon name="receipt" size={20} />
                <div>
                  <strong>{t('home.sugShop')}</strong>
                  <small>2 Sep · 1:40 PM</small>
                </div>
              </div>
              <div className="lp2-sugbox">
                <span className="lp2-suglabel"><Icon name="sparkles" /> {t('home.sugLabel')}</span>
                <div className="lp2-sugrow">
                  <span className="mp-ico t4"><Icon name="burger" /></span>
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
                {t('home.sugHow')} <Icon name="arrowRight" />
              </Link>
            </div>

            {/* saving tips */}
            <article className="lp2-tipcard lp-reveal" style={{ transitionDelay: '180ms' }}>
              <span className="lp2-f-ico t4"><Icon name="bulb" /></span>
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
              <span className="lp2-f-ico t3"><Icon name="chartUp" /></span>
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
                {t('home.repBtn')} <Icon name="arrowRight" />
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
                { icon: 'burger', key: 'home.catFood', cls: 't4' },
                { icon: 'bus', key: 'home.catTransport', cls: 't3' },
                { icon: 'house', key: 'home.catHostel', cls: 't5' },
                { icon: 'books', key: 'home.catAcademics', cls: 't1' },
                { icon: 'gamepad', key: 'home.catEntertainment', cls: 't2' },
                { icon: 'card', key: 'home.catSubs', cls: 't3' },
              ].map((c) => (
                <span key={c.key} className="lp2-catpill">
                  <span className={`lp2-f-ico ${c.cls}`}><Icon name={c.icon} /></span>
                  {t(c.key)}
                </span>
              ))}
            </div>
          </div>

          <div className="lp2-cats-photo lp-reveal" role="img" aria-label={t('home.handDreams')}>
            {/* flat SVG scene: a campus day — food cart, bus, hostel, books,
                a game and a subscription, with three students living it */}
            <CatsArt />
            <div className="lp2-hand hp3" aria-hidden="true">{t('home.handDreams')}</div>
          </div>
        </section>

        {/* ----------------------------- privacy ----------------------------- */}
        <section className="lp2-privacy lp-reveal" id="privacy">
          <div className="lp2-priv-left">
            <span className="lp2-shield"><Icon name="shield" size={30} /></span>
            <div>
              <span className="lp2-eyebrow">{t('home.privEyebrow')}</span>
              <h2>{t('home.privTitle')}</h2>
              <p>{t('home.privBody')}</p>
            </div>
          </div>
          <ul className="lp2-priv-list">
            <li><Icon name="check" /> {t('home.privC1')}</li>
            <li><Icon name="check" /> {t('home.privC2')}</li>
            <li><Icon name="check" /> {t('home.privC3')}</li>
            <li><Icon name="check" /> {t('home.privC4')}</li>
            <li><Icon name="check" /> {t('home.privC5')}</li>
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
        {/* The picture on the left and the questions on the right: the questions
            are the point of a FAQ, and a narrow column of long sentences is the
            wrong shape for them. */}
        <section id="faq" className="lp2-section lp2-faq" aria-labelledby="faq-heading">
          <FaqArt />
          <div className="lp2-faq-copy">
            <span className="lp2-eyebrow">{t('home.nav.faq')}</span>
            <h2 id="faq-heading">{t('home.faqTitle')}</h2>
            <div className="lp2-faq-list">
              {[1, 2, 3, 4, 5].map((n) => (
                <details key={n} className="faq-item lp-reveal" style={{ transitionDelay: `${n * 50}ms` }}>
                  <summary className="faq-q">
                    {t(`home.faqQ${n}`)}
                    <span className="faq-toggle" aria-hidden="true"><Icon name="plus" /></span>
                  </summary>
                  <p className="faq-a">{t(`home.faqA${n}`)}</p>
                </details>
              ))}
            </div>
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
              {t('home.getStarted')} <Icon name="arrowRight" />
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
                <li><button type="button" className="linklike" onClick={() => openPanel('register')}>{t('home.link.register')}</button></li>
                <li><button type="button" className="linklike" onClick={() => openPanel('login')}>{t('auth.signIn')}</button></li>
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
              <h3>{t('nav.section.tools')}</h3>
              <ul>
                <li><Link to="/savings-options">{t('nav.savingsOptions')}</Link></li>
                <li><Link to="/grow-money">{t('nav.growMoney')}</Link></li>
                <li><Link to="/side-income">{t('nav.sideIncome')}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t('nav.section.standout')}</h3>
              <ul>
                <li><Link to="/groups">{t('nav.groups')}</Link></li>
                <li><Link to="/wishlist">{t('nav.wishlist')}</Link></li>
                <li><Link to="/vault">{t('nav.vault')}</Link></li>
                <li><Link to="/dashboard">{t('home.link.quickText')}</Link></li>
                <li><Link to="/dashboard">{t('home.link.survival')}</Link></li>
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
                <li><button type="button" className="linklike" onClick={() => openPanel('admin')}>{t('home.link.adminSignIn')}</button></li>
              </ul>
            </div>
          </nav>
        </section>
          </>
        )}
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
        <Icon name="arrowUp" />
      </button>
    </div>
  );
}
