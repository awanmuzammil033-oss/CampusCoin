import { useLocale } from '../../locale.jsx';
import Icon from '../Icon.jsx';

/**
 * HeroShowcase — the whole right-hand half of the hero as one piece.
 *
 * The board picture is: a dark-green field with soft green/teal blobs and a few
 * glowing dots, a phone mockup of the dashboard, a currency-converter popover
 * floating over it, a gold coin, and small handwritten notes with arrows
 * pointing at things. This is all of that, plus the motion the picture needs to
 * stop looking like a screenshot.
 *
 * THE MOTION, AND WHY EACH PIECE MOVES DIFFERENTLY
 *
 *   phone      .lp2-phone keeps the stylesheet's own 6s `lp-bob`, and a new
 *              .lp2-show-stage around it adds a 9s ±0.4° tilt. Two tempos that
 *              never line up, so the phone reads as held in a hand rather than
 *              pasted on. The tilt lives on the WRAPPER on purpose: if the
 *              keyframe below is ever missing, the phone still bobs.
 *   popover    the converter panel fades and slides in once, 0.95s after paint,
 *              and then stops. It reuses the landing's existing `lp-fade` with
 *              `fill-mode: both`, so nothing new has to be declared — and a
 *              form that keeps pulsing is noise, so it does not loop.
 *   cards      the three floating cards keep `lp-float` but at 5.2s / 6.7s /
 *              4.3s with negative delays. Different durations is the whole
 *              trick: same keyframe, never in step, so the group never pulses
 *              in unison.
 *   coin       one slow `cc-spin` turn in 30s — subtle, and visible because
 *              the coin's inner ring is dashed.
 *   blobs      three gradients crossing each other on 36s / 44s / 50s loops.
 *   dots       static. A glow does not need to move to be a glow.
 *
 * THE POPOVER IS A PICTURE OF THE REAL DRAWER, SO IT SAYS WHAT THE DRAWER SAYS
 *
 * Every word on it is a `conv.*` key the live CurrencyDrawer already ships:
 * `conv.title`, `conv.amount`, `conv.from`, `conv.to`, `conv.rateLine`,
 * `conv.referenceMark`, `conv.mixedNote`, `conv.applyAll`. It is marked the
 * same way the real select marks it — PKR carries `conv.referenceMark`,
 * because PKR is one of the currencies the live feed does not carry and the app
 * prices it from a dated table instead. The rate and the converted figure are
 * consistent with each other (1,240.50 x 281.04 = 348,630.12). No new strings
 * were invented, and none are needed: if the reference picture's own "Update"
 * button were reproduced here it would contradict the button a student
 * actually presses.
 *
 * Because the popover is a picture, it reuses the drawer's own classes
 * (.cc-drawer-body, .cc-drawer-pair, .cc-drawer-result …) and sits inside the
 * phone's `role="img"`, so it is skipped by a screen reader and is not a form
 * anybody can half-use. The real drawer is fully readable when it is opened.
 *
 * ----------------------------------------------------------------------------
 * CSS THIS FILE NEEDS IN campuscoin.css — two keyframes and the popover's card.
 *
 *   @keyframes lp2-hold {
 *     from { transform: rotate(-0.4deg); }
 *     to   { transform: rotate(0.4deg); }
 *   }
 *   @keyframes lp2-blob-drift {
 *     from { transform: translate3d(-3%, 2%, 0) scale(1); }
 *     to   { transform: translate3d(4%, -3%, 0) scale(1.12); }
 *   }
 *
 *   .lp2-pop {
 *     border: 1px solid var(--cc-border);
 *     border-radius: 16px;
 *     background: var(--cc-surface);
 *     box-shadow: 0 22px 48px rgba(4, 24, 19, 0.45);
 *     text-align: start;
 *   }
 *   .lp2-pop .cc-drawer-body   { gap: 7px; padding: 13px 14px 15px; }
 *   .lp2-pop .cc-drawer-title  { font-size: 0.9rem; }
 *   .lp2-pop .cc-drawer-amount { min-height: 34px; font-size: 1.05rem; padding: 6px 8px; }
 *   .lp2-pop .input            { min-height: 32px; padding: 5px 8px; font-size: 0.8rem; }
 *   .lp2-pop .cc-drawer-swap   { min-height: 32px; padding: 4px 8px; }
 *   .lp2-pop .cc-drawer-result { padding: 10px; }
 *   .lp2-pop .cc-drawer-result strong { font-size: 1.05rem; }
 *   .lp2-pop .smallish         { font-size: 0.72rem; }
 *   .lp2-pop .cc-drawer-code   { font-size: 0.68rem; }
 *   .lp2-pop .btn              { min-height: 34px; padding: 6px 10px; font-size: 0.76rem;
 *                               white-space: normal; }   // 14 languages: let it wrap
 *
 *   @media (prefers-reduced-motion: reduce) {
 *     .lp2-show-stage, .lp2-show-blob, .lp2-pop, .lp2-coin, .lp2-note-a { animation: none; }
 *   }
 *
 *   … and, in the sheet's existing max-width:1080px block that already hides
 *   .lp2-float / .hp1 / .hp2, add .lp2-pop, .lp2-coin, .lp2-note-a — a 296px
 *   card cannot overlap a phone in a one-column hero.
 *
 * The sheet's catch-all reduced-motion block (`* { animation-duration: .01ms
 * !important }`) already neutralises every animation declared here, so the rule
 * above is belt and braces. Nothing in this file hides anything in its resting
 * state — the popover's invisible first frame comes from `lp-fade` alone — so if
 * all of the CSS above is missing, the hero still renders complete and correct,
 * just still. Nothing can end up invisible.
 *
 * WHY THERE IS NO `animation` SHORTHAND HERE
 *
 * Every animation in this file names itself through the stylesheet, and only
 * its duration or delay is set here. An inline `animation` shorthand beats any
 * stylesheet rule short of !important, which would have made every one of
 * these impossible to switch off: campuscoin.css honours
 * `prefers-reduced-motion` in one media query, and an inline shorthand would
 * have quietly ignored it. The numbers are the markup's business; the
 * animation is the sheet's.
 * * WHY THE GEOMETRY IS INLINE: campuscoin.css is not this component's to edit,
 * so every static placement (a layer's strip, a blob's corner, the popover's
 * offset from the phone) is declared where it is used. The stylesheet keeps only
 * what it must own: the two keyframes and the popover's own surface.
 * ----------------------------------------------------------------------------
 */

/* The category shares inside the phone's ring. The ring itself is a conic
   gradient written out in campuscoin.css, so these six have to be the same six
   literals or the dots would not line up with their slices. */
const PHONE_LEGEND = [
  { key: 'home.catFood', pct: 38, color: '#f5b400', icon: 'burger' },
  { key: 'home.catTransport', pct: 16, color: '#14b8a6', icon: 'bus' },
  { key: 'home.catHostel', pct: 15, color: '#2563eb', icon: 'house' },
  { key: 'home.catAcademics', pct: 12, color: '#7c3aed', icon: 'books' },
  { key: 'home.catEntertainment', pct: 10, color: '#db2777', icon: 'gamepad' },
  { key: 'home.catOther', pct: 9, color: '#64748b', icon: 'dots' },
];

/*
 * The three soft blobs. Colour comes from a token and the softness from the
 * element's own opacity, so a blob is the same family in the light theme and the
 * dark one — only its strength changes, which is what a glow should do.
 * Durations are 36 / 44 / 50s and the delays are negative, so they are already
 * out of step when the page paints and they cross each other slowly.
 */
const BLOBS = [
  { key: 'a', width: '62%', height: '78%', at: { insetInlineStart: '-6%', top: '4%' }, token: 'var(--cc-primary)', alpha: 0.5, dur: 36, delay: 0 },
  { key: 'b', width: '54%', height: '70%', at: { insetInlineStart: '46%', top: '22%' }, token: 'var(--cc-income)', alpha: 0.42, dur: 44, delay: -15 },
  { key: 'c', width: '40%', height: '46%', at: { insetInlineStart: '18%', top: '46%' }, token: 'var(--cc-primary)', alpha: 0.34, dur: 50, delay: -31 },
];

/* The small glowing dots. `currentColor` lets the halo take the token too, so
   there is no second colour literal in this file. */
const DOTS = [
  { key: 'a', size: 10, at: { insetInlineStart: '16%', top: '24%' }, token: 'var(--cc-accent)', halo: 14 },
  { key: 'b', size: 6, at: { insetInlineStart: '84%', top: '41%' }, token: 'var(--cc-income)', halo: 10 },
  { key: 'c', size: 8, at: { insetInlineStart: '30%', top: '82%' }, token: 'var(--cc-accent-soft)', halo: 12 },
  { key: 'd', size: 5, at: { insetInlineStart: '66%', top: '16%' }, token: 'var(--cc-income)', halo: 9 },
];

/* One tempo per floating card. The stylesheet gives all three the same 4.6s;
 * these replace it, and nothing else about the cards changes. */
const CARD_MOTION = {
  f1: { duration: '5.2s', delay: '0s' },
  f2: { duration: '6.7s', delay: '-1.6s' },
  f3: { duration: '4.3s', delay: '-3.1s' },
};

const STAGE_STYLE = {
  position: 'relative',
  zIndex: 2,
  width: '100%',
  display: 'grid',
  placeItems: 'center',
  // the hand-held tilt. `lp-bob` on the phone inside it is the stylesheet's own.
  animationDelay: '-3.1s',
  willChange: 'transform',
};

const GLOW_STYLE = {
  position: 'absolute',
  insetInlineStart: '50%',
  top: '50%',
  width: '86%',
  height: '96%',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: 'radial-gradient(closest-side, var(--cc-primary), transparent 72%)',
  opacity: 0.38,
  zIndex: 0,
  pointerEvents: 'none',
};

/* The popover hangs off the phone's padding box, so these offsets are measured
   from just inside its bezel: 100px out to the left, level with the balance
   card. Two thirds of the card lies over the phone, which is what makes it read
   as floating in front of it rather than sitting beside it. */
const POP_STYLE = {
  position: 'absolute',
  insetInlineStart: '-100px',
  top: '78px',
  width: '296px',
  zIndex: 5,
  pointerEvents: 'none',
  // the hero goes text-align: center under 1080px, and this card is a picture of
  // a form: its labels have to stay left-aligned wherever it ends up shown.
  textAlign: 'start',
  // once, on an offset, and then still. `both` holds the last frame, so it does
  // not blink back to nothing, and the landing's own lp-fade is reused as-is.
  animationDelay: '0.95s',
};

const COIN_STYLE = {
  position: 'absolute',
  insetInlineEnd: '-26px',
  top: '104px',
  width: 46,
  height: 46,
  display: 'block',
  zIndex: 4,
  pointerEvents: 'none',
  // one turn in half a minute. `cc-spin` is the app's own spinner keyframe.
  animationDuration: '30s',
};

export default function HeroShowcase({ className = '' }) {
  const { t } = useLocale();

  return (
    <div className={`lp2-hero-visual lp2-showcase${className ? ` ${className}` : ''}`}>
      {/* --- the field the whole picture sits in ------------------------------ */}
      {BLOBS.map((blob) => (
        <span
          key={blob.key}
          className={`lp2-show-blob lp2-show-blob-${blob.key}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            ...blob.at,
            width: blob.width,
            height: blob.height,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, ${blob.token}, transparent 72%)`,
            opacity: blob.alpha,
            zIndex: 0,
            pointerEvents: 'none',
            animationDuration: `${blob.dur}s`,
            animationDelay: `${blob.delay}s`,
            willChange: 'transform',
          }}
        />
      ))}

      {DOTS.map((dot) => (
        <span
          key={dot.key}
          className={`lp2-show-dot lp2-show-dot-${dot.key}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            ...dot.at,
            width: dot.size,
            height: dot.size,
            display: 'block',
            borderRadius: '50%',
            color: dot.token,
            background: 'currentColor',
            boxShadow: `0 0 ${dot.halo}px currentColor`,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* --- the phone, and everything that belongs to the phone -------------- */}
      <div className="lp2-show-stage" style={STAGE_STYLE}>
        <span className="lp2-show-glow" aria-hidden="true" style={GLOW_STYLE} />

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



          {/* The coin. A dashed inner ring is what makes the slow turn readable;
              a plain disc would just spin in place and look broken. */}
          <span className="lp2-coin" style={COIN_STYLE}>
            <svg viewBox="0 0 48 48" width="100%" height="100%" focusable="false" aria-hidden="true">
              <circle cx="24" cy="24" r="22" style={{ fill: 'var(--cc-accent)' }} />
              <circle
                cx="24"
                cy="24"
                r="15.5"
                style={{ fill: 'none', stroke: 'var(--cc-accent-soft)', strokeWidth: 3.5, strokeDasharray: '3 3.4' }}
              />
              <circle cx="24" cy="24" r="6" style={{ fill: 'var(--cc-accent-soft)' }} />
            </svg>
          </span>
        </div>
      </div>

      {/* --- the three floating cards, each on its own clock ----------------- */}
      <div
        className="lp2-float f1"
        aria-hidden="true"
        style={{ animationDuration: CARD_MOTION.f1.duration, animationDelay: CARD_MOTION.f1.delay }}
      >
        <span className="lp2-f-ico coin">🪙</span>
        <div>
          <strong>+$500</strong>
          <span>{t('home.floatAllowanceT')}</span>
          <small>{t('home.floatAllowanceD')}</small>
        </div>
      </div>
      <div
        className="lp2-float f2"
        aria-hidden="true"
        style={{ animationDuration: CARD_MOTION.f2.duration, animationDelay: CARD_MOTION.f2.delay }}
      >
        <span className="lp2-f-ico">🍔</span>
        <div>
          <strong>{t('home.floatFoodT')} 72%</strong>
          <span className="lp2-f-track"><span style={{ width: '72%' }} /></span>
          <small>$180 / $250</small>
        </div>
      </div>
      <div
        className="lp2-float f3"
        aria-hidden="true"
        style={{ animationDuration: CARD_MOTION.f3.duration, animationDelay: CARD_MOTION.f3.delay }}
      >
        <span className="lp2-f-ico bulb">💡</span>
        <div>
          <strong>{t('home.floatSaveT')}</strong>
          <small>{t('home.floatSaveW')}</small>
          <span>{t('home.floatSaveS')}</span>
        </div>
      </div>

      {/* --- the handwritten notes ------------------------------------------- */}
      <div className="lp2-hand hp1" aria-hidden="true">
        {t('home.handSteps')}
        <svg viewBox="0 0 60 34" className="lp2-hand-arrow"><path d="M2 4 C 22 2, 46 8, 54 26 M46 24 l9 4 -3 -10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </div>


    </div>
  );
}
