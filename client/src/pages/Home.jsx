import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import Login from './Login.jsx';
import Register from './Register.jsx';
import AdminLogin from './AdminLogin.jsx';
import ForgotPassword from './ForgotPassword.jsx';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import LocalePickers from '../components/LocalePickers.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Icon from '../components/Icon.jsx';
import HeroWaves from '../components/art/HeroWaves.jsx';
import HeroOrbs from '../components/art/HeroOrbs.jsx';
import MoneyJourney from '../components/landing/MoneyJourney.jsx';
import WhatIfLab from '../components/landing/WhatIfLab.jsx';
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
 * The links, in the order the page actually reads: home, the tools the rooms
 * money lives in, what it does, insights, how it works, questions. Two rules
 * keep this list honest, and both were learned the hard way:
 *
 *  - INSIGHTS COMES BEFORE HOW-IT-WORKS, because that is the order the sections
 *    are in. When the two disagreed, the highlight followed the list and lit up
 *    the wrong link.
 *  - TOOLS COMES BEFORE FEATURES, because the standout tools and the rooms were
 *    moved up above "manage your money like a pro". The list is not a preference;
 *    it is a reading of the page.
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
  { id: 'rooms', label: 'home.nav.rooms' },
  { id: 'features', label: 'home.nav.features' },
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

const STAT_ITEMS = [
  { id: 'stat1', icoClass: 's1', icon: 'bolt', valKey: 'home.stat1a', subKey: 'home.stat1b' },
  { id: 'stat2', icoClass: 's2', icon: 'calendar', valKey: 'home.stat2a', subKey: 'home.stat2b' },
  { id: 'stat3', icoClass: 's3', icon: 'grid', valKey: 'home.stat3a', subKey: 'home.stat3b' },
  { id: 'stat4', icoClass: 's4', icon: 'shield', valKey: 'home.stat4a', subKey: 'home.stat4b' },
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
  if (which === 'forgot-password' || which === 'forgot') return <ForgotPassword {...shared} />;
  return <Login {...shared} />;
}

export default function Home({ view } = {}) {
  const { t } = useLocale();
  const { user, loading, logout } = useAuth() || {};
  const [active, setActive] = useState('top');
  const navigate = useNavigate();
  const location = useLocation();

  const [params] = useSearchParams();
  const queryPanel = params.get('panel');

  // Determine panel from view prop, path, or query parameter
  let panel = view;
  if (!panel) {
    if (location.pathname === '/login') panel = 'login';
    else if (location.pathname === '/register') panel = 'register';
    else if (location.pathname === '/forgot-password') panel = 'forgot-password';
    else if (location.pathname === '/control/login') panel = 'admin';
    else if (queryPanel) {
      if (queryPanel === 'admin' || queryPanel === 'admin-login') panel = 'admin';
      else if (queryPanel === 'register') panel = 'register';
      else if (queryPanel === 'forgot-password' || queryPanel === 'forgot') panel = 'forgot-password';
      else panel = 'login';
    }
  }

  /** Scroll to top when view/route changes */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [panel, location.pathname]);

  /** Open a form by navigating to its canonical route */
  function openPanel(which) {
    if (which === 'register') navigate('/register');
    else if (which === 'admin') navigate('/control/login');
    else if (which === 'forgot-password' || which === 'forgot') navigate('/forgot-password');
    else navigate('/login');
  }

  /** Close it and navigate back to landing home */
  function closePanel() {
    navigate('/');
  }

  /** Cross-linking between forms */
  function switchTo(path) {
    if (path === '/register' || path === 'register') navigate('/register');
    else if (path === '/control/login' || path === '/?panel=admin' || path === 'admin') navigate('/control/login');
    else if (path === '/forgot-password' || path === 'forgot-password' || path === 'forgot') navigate('/forgot-password');
    else navigate('/login');
  }
  const [showTop, setShowTop] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [showSitemap, setShowSitemap] = useState(false);

  /* Close sitemap modal on Escape */
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setShowSitemap(false); }
    if (showSitemap) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showSitemap]);

  /* Scroll reveal: everything marked .lp-reveal rises the first time it enters
     the viewport. This RE-RUNS when a form is opened or closed, because the
     landing sections are unmounted while a form is up and a fresh set of them is
     mounted after - a watcher created once at mount was watching elements that no
     longer existed, and every section came back at opacity 0 with the page blank.
     It also shows whatever is already on screen at once, so no section can be left
     invisible waiting for a callback that has not fired yet. */
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.lp-reveal'));
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-in'));
      return undefined;
    }

    // what the reader can already see, before any observer has spoken
    const onScreen = () => {
      for (const el of els) {
        const box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) el.classList.add('is-in');
      }
    };
    onScreen();

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
    els.forEach((el) => {
      if (!el.classList.contains('is-in')) io.observe(el);
    });

    // a section can be mounted already inside the viewport, and a resize can move
    // one there without any scroll event
    window.addEventListener('resize', onScreen);
    return () => {
      io.disconnect();
      window.removeEventListener('resize', onScreen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

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
      {/* The header does not change when a form opens. The form is a white
          page and the header is mint on dark green, which stays readable over
          white - and a reader who has not gone anywhere should not watch the
          frame around them repaint itself. */}
      <header className={`lp-nav${stuck ? ' is-stuck' : ''}`}>
        <Link to="/" className="brand lp-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">{t('app.name')}</span>
        </Link>

        <nav className="lp-nav-links" aria-label={t('home.featuresAria')}>
          {NAV.map((item) => (
            <a
              key={item.id}
              href={panel ? `/#${item.id}` : `#${item.id}`}
              className={`lp-nav-link${active === item.id && !panel ? ' active' : ''}`}
              aria-current={active === item.id && !panel ? 'true' : undefined}
              onClick={(e) => {
                if (panel) {
                  e.preventDefault();
                  navigate('/#' + item.id);
                  return;
                }
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
          {/* Sitemap trigger */}
          <button
            type="button"
            className="lp-nav-sitemap-btn"
            onClick={() => setShowSitemap(true)}
            aria-label={t('home.sitemap')}
            title={t('home.sitemap')}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="18" height="18">
              <rect x="1" y="2" width="5" height="4" rx="1" fill="currentColor" opacity=".9"/>
              <rect x="7.5" y="2" width="5" height="4" rx="1" fill="currentColor" opacity=".65"/>
              <rect x="14" y="2" width="5" height="4" rx="1" fill="currentColor" opacity=".4"/>
              <rect x="1" y="8" width="5" height="4" rx="1" fill="currentColor" opacity=".7"/>
              <rect x="7.5" y="8" width="5" height="4" rx="1" fill="currentColor" opacity=".9"/>
              <rect x="14" y="8" width="5" height="4" rx="1" fill="currentColor" opacity=".55"/>
              <rect x="1" y="14" width="5" height="4" rx="1" fill="currentColor" opacity=".45"/>
              <rect x="7.5" y="14" width="5" height="4" rx="1" fill="currentColor" opacity=".6"/>
              <rect x="14" y="14" width="5" height="4" rx="1" fill="currentColor" opacity=".85"/>
            </svg>
            <span className="lp-nav-sitemap-label">{t('home.sitemap')}</span>
          </button>
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
              <Link
                to="/login"
                className={`lp-nav-link lp-nav-signin${panel === 'login' ? ' active' : ''}`}
              >
                {t('auth.signIn')}
              </Link>
              <Link to="/register" className="btn btn-grad btn-sm">
                {t('home.getStarted')}
              </Link>
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
          {/* Lit spheres first, then the wave lines over them, then the picture:
              a line is nearer than a sphere, and depth is the whole difference
              between a background and a photograph. */}
          <HeroOrbs />
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

        {/* ── stats band with continuous scrolling marquee — overlaps the bottom of the hero ── */}
        <section className="lp2-stats lp2-stats-bar lp2-stats-overlap lp-reveal" aria-label={t('home.stat3b')}>
          <div className="lp2-stats-marquee">
            <div className="lp2-stats-track">
              {STAT_ITEMS.map((st) => (
                <div key={`st1-${st.id}`} className="lp2-stat-card">
                  <span className={`lp2-stat-ico ${st.icoClass}`}><Icon name={st.icon} /></span>
                  <div className="lp2-stat-text">
                    <strong>{t(st.valKey)}</strong>
                    <span>{t(st.subKey)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="lp2-stats-track" aria-hidden="true">
              {STAT_ITEMS.map((st) => (
                <div key={`st2-${st.id}`} className="lp2-stat-card">
                  <span className={`lp2-stat-ico ${st.icoClass}`}><Icon name={st.icon} /></span>
                  <div className="lp2-stat-text">
                    <strong>{t(st.valKey)}</strong>
                    <span>{t(st.subKey)}</span>
                  </div>
                </div>
              ))}
            </div>
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

        {/* ------------------------ financial overview ----------------------- */}
        {/* ---------------------------- money journey ----------------------- */}
        {/* The shape of a month, in the order the money moves in it. */}
        

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
        

        {/* --------------------------- categories ---------------------------- */}
        

        {/* ----------------------------- privacy ----------------------------- */}
        

        {/* -------------------------- how it works --------------------------- */}
        {/* Money Weather section removed — cleaner flow */}
        <section id="journey" className="lp2-section lp2-journey-section lp-reveal" aria-labelledby="journey-heading">
          <div className="lp2-journey-head">
            <span className="lp-eyebrow">{t('home.journey.eyebrow')}</span>
            <h2 id="journey-heading">{t('home.journey.title')}</h2>
            <p>{t('home.journey.sub')}</p>
          </div>
          <MoneyJourney />
        </section>
<section id="lab" className="lp2-section lp2-lab-section lp-reveal" aria-labelledby="lab-heading">
          <div className="lp2-lab-head">
            <span className="lp-eyebrow">{t('home.lab.eyebrow')}</span>
            <h2 id="lab-heading">{t('home.lab.title')}</h2>
            <p>{t('home.lab.sub')}</p>
          </div>
          <WhatIfLab />
        </section>
{/* The month in three words, and the rule behind each. */}
        

        <section id="how" className="lp-how lp2-section" aria-labelledby="how-heading">
          <div className="lp2-how-text">
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
          </div>
        </section>

        {/* ------------------------------- faq ------------------------------- */}
        {/* The picture on the left and the questions on the right: the questions
            are the point of a FAQ, and a narrow column of long sentences is the
            wrong shape for them. */}
        {/* --------------------------- what if lab -------------------------- */}
        {/* Three questions about a month that has not happened yet. */}
        

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
        <section className="lp2-cta lp2-cta-spaced lp-reveal">
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

        {/* Sitemap is now in the modal — section removed from page body */}
          </>
        )}
      </main>

      {/* ========================= SITEMAP MODAL ========================= */}
      {showSitemap && (
        <div
          className="sm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sm-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSitemap(false); }}
        >
          <div className="sm-modal">
            {/* header bar */}
            <div className="sm-header">
              <div className="sm-header-left">
                <span className="sm-header-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" width="22" height="22">
                    <rect x="1" y="2" width="5" height="4" rx="1" fill="currentColor"/>
                    <rect x="7.5" y="2" width="5" height="4" rx="1" fill="currentColor" opacity=".7"/>
                    <rect x="14" y="2" width="5" height="4" rx="1" fill="currentColor" opacity=".4"/>
                    <rect x="1" y="8" width="5" height="4" rx="1" fill="currentColor" opacity=".65"/>
                    <rect x="7.5" y="8" width="5" height="4" rx="1" fill="currentColor"/>
                    <rect x="14" y="8" width="5" height="4" rx="1" fill="currentColor" opacity=".55"/>
                    <rect x="1" y="14" width="5" height="4" rx="1" fill="currentColor" opacity=".4"/>
                    <rect x="7.5" y="14" width="5" height="4" rx="1" fill="currentColor" opacity=".6"/>
                    <rect x="14" y="14" width="5" height="4" rx="1" fill="currentColor"/>
                  </svg>
                </span>
                <div>
                  <h2 id="sm-modal-title" className="sm-title">{t('home.sitemap')}</h2>
                  <p className="sm-subtitle">{t('home.sitemapSubtitle')}</p>
                </div>
              </div>
              <button
                type="button"
                className="sm-close"
                onClick={() => setShowSitemap(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="20" height="20" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* link grid */}
            <nav aria-label={t('home.sitemap')} className="sm-grid">
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#059669'}} />
                  {t('nav.section.account')}
                </h3>
                <ul>
                  <li><Link to="/register" onClick={() => setShowSitemap(false)}>{t('home.link.register')}</Link></li>
                  <li><Link to="/login" onClick={() => setShowSitemap(false)}>{t('auth.signIn')}</Link></li>
                  <li><Link to="/forgot-password" onClick={() => setShowSitemap(false)}>{t('home.link.resetPassword')}</Link></li>
                </ul>
              </div>
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#2563eb'}} />
                  {t('nav.section.money')}
                </h3>
                <ul>
                  <li><Link to="/dashboard" onClick={() => setShowSitemap(false)}>{t('nav.dashboard')}</Link></li>
                  <li><Link to="/transactions" onClick={() => setShowSitemap(false)}>{t('nav.transactions')}</Link></li>
                  <li><Link to="/transactions/new" onClick={() => setShowSitemap(false)}>{t('home.link.addIncomeExpense')}</Link></li>
                  <li><Link to="/transactions/import" onClick={() => setShowSitemap(false)}>{t('home.link.importCsv')}</Link></li>
                  <li><Link to="/recurring" onClick={() => setShowSitemap(false)}>{t('home.link.recurringEntries')}</Link></li>
                  <li><Link to="/categories" onClick={() => setShowSitemap(false)}>{t('nav.categories')}</Link></li>
                  <li><Link to="/budgets" onClick={() => setShowSitemap(false)}>{t('nav.budgets')}</Link></li>
                </ul>
              </div>
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#f59e0b'}} />
                  {t('nav.section.tools')}
                </h3>
                <ul>
                  <li><Link to="/savings-options" onClick={() => setShowSitemap(false)}>{t('nav.savingsOptions')}</Link></li>
                  <li><Link to="/grow-money" onClick={() => setShowSitemap(false)}>{t('nav.growMoney')}</Link></li>
                  <li><Link to="/side-income" onClick={() => setShowSitemap(false)}>{t('nav.sideIncome')}</Link></li>
                </ul>
              </div>
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#7c3aed'}} />
                  {t('nav.section.standout')}
                </h3>
                <ul>
                  <li><Link to="/groups" onClick={() => setShowSitemap(false)}>{t('nav.groups')}</Link></li>
                  <li><Link to="/wishlist" onClick={() => setShowSitemap(false)}>{t('nav.wishlist')}</Link></li>
                  <li><Link to="/vault" onClick={() => setShowSitemap(false)}>{t('nav.vault')}</Link></li>
                  <li><Link to="/dashboard" onClick={() => setShowSitemap(false)}>{t('home.link.quickText')}</Link></li>
                  <li><Link to="/dashboard" onClick={() => setShowSitemap(false)}>{t('home.link.survival')}</Link></li>
                </ul>
              </div>
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#0ea5e9'}} />
                  {t('nav.section.understand')}
                </h3>
                <ul>
                  <li><Link to="/reports" onClick={() => setShowSitemap(false)}>{t('nav.reports')}</Link></li>
                  <li><Link to="/insights" onClick={() => setShowSitemap(false)}>{t('home.link.monthlyInsights')}</Link></li>
                  <li><Link to="/tips" onClick={() => setShowSitemap(false)}>{t('home.link.savingTips')}</Link></li>
                  <li><Link to="/bookmarks" onClick={() => setShowSitemap(false)}>{t('home.link.bookmarksNotes')}</Link></li>
                  <li><Link to="/notifications" onClick={() => setShowSitemap(false)}>{t('topbar.notifications')}</Link></li>
                </ul>
              </div>
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#6b7280'}} />
                  {t('home.section.settings')}
                </h3>
                <ul>
                  <li><Link to="/profile" onClick={() => setShowSitemap(false)}>{t('home.link.profile')}</Link></li>
                  <li><Link to="/profile" onClick={() => setShowSitemap(false)}>{t('home.link.theme')}</Link></li>
                  <li><Link to="/profile" onClick={() => setShowSitemap(false)}>{t('home.link.textSize')}</Link></li>
                </ul>
              </div>
              <div className="sm-group">
                <h3 className="sm-group-title">
                  <span className="sm-dot" style={{background:'#ef4444'}} />
                  {t('home.section.staff')}
                </h3>
                <ul>
                  <li><Link to="/control/login" onClick={() => setShowSitemap(false)}>{t('home.link.adminSignIn')}</Link></li>
                </ul>
              </div>
            </nav>

            {/* footer strip */}
            <div className="sm-footer">
              <Link className="brand" to="/" onClick={() => setShowSitemap(false)}>
                <span className="brand-mark" aria-hidden="true">C</span>
                <span className="brand-name">{t('app.name')}</span>
              </Link>
              <span className="sm-esc-hint">Press <kbd>Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}

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
