/**
 * HeroWaves — the wave lines behind the hero, and the only thing on the page
 * that is allowed to run forever.
 *
 * Pass one drew three static paths. Pass two let them drift sideways, and that
 * read as three ropes sliding through the middle of the hero, straight across
 * the headline; the movement was not smooth either, because a stretched SVG
 * re-rasterising every frame stutters on a normal laptop — worse than no
 * movement at all.
 *
 * This is the third pass, and it is how "moving in place" is actually done:
 * a SEAMLESS HORIZONTAL LOOP.
 *
 *   - Each line is drawn across FOUR full waves, so the viewBox is exactly
 *     twice the width of the hero (see SPAN / REPEATS below).
 *   - The <svg> is then 200% wide and slides to exactly -50%.
 *   - Half of that slide is exactly the hero's own width, and the hero's width
 *     is exactly two whole waves — so the drawing at -50% is pixel-for-pixel
 *     the drawing at 0. The frame where the animation restarts is the frame it
 *     started from. No snap, no seam, no edge crossing the composition.
 *
 * The wave therefore travels forever while the picture stays exactly where it
 * was put. It never crosses and comes back, and it never drifts off: there is
 * only one direction, and it wraps under the surface.
 *
 * What keeps it cheap: the only thing that moves is `transform: translate3d()`
 * on the <svg>. Nothing animates `d`, `stroke-dashoffset` or `left`, so no
 * frame is ever re-rasterised — the browser hands the same texture to the
 * compositor and slides it. Each layer also gets a few pixels of slow vertical
 * drift (`lp-bob`, re-timed) so the group reads as water rather than as a
 * conveyor belt.
 *
 * THE LAYERS — different amplitude AND different duration, which is the whole
 * trick: they slide at 26s / 34s / 44s / 38s and breathe at 17s / 23s / 29s /
 * 31s, so the four lines are never in step and never line up into a pulse.
 * Strips are weighted to the lower half of the hero (the lines land at roughly
 * 50%, 70%, 76% and 81% of its height) and every stroke sits between 12% and
 * 30% opacity: this is decoration, and the copy has to win.
 *
 * ----------------------------------------------------------------------------
 * CSS THIS FILE NEEDS IN campuscoin.css — one keyframe, nothing else. The
 * geometry (200% width, -50% target, per-layer durations) is declared inline on
 * purpose: campuscoin.css is not this component's to edit, so everything that is
 * static or that just names an animation travels with the markup and the
 * stylesheet keeps only the one thing it must own.
 *
 *   @keyframes lp2-wave-slide {
 *     from { transform: translate3d(0, 0, 0); }
 *     to   { transform: translate3d(-50%, 0, 0); }
 *   }
 *
 *   @media (prefers-reduced-motion: reduce) {
 *     .lp2-wave,        // the vertical drift, already named in the sheet's block
 *     .lp2-wave-svg { animation: none; }
 *   }
 *
 * The sheet's old `.lp2-waves-svg` rule (one static, full-width drawing) is no
 * longer used by any markup and can be deleted or left alone. If the keyframe
 * above is missing the lines simply do not move: `animation-name` pointing at
 * nothing is ignored, so the failure mode is "still", never "broken".
 * ----------------------------------------------------------------------------
 */

/* One full wave: crest, trough, crest, trough, ending level where it started. */
const PERIOD = 900;

/*
 * Periods drawn back to back. This has to be EVEN: the drawing is 2x the
 * container, so the container shows SPAN / 2 units, and -50% moves exactly
 * SPAN / 2 units. With four repeats the hero shows two whole waves and the
 * slide is two whole waves — the join is invisible. With an odd number the
 * slide would land mid-wave and the loop would snap.
 */
const REPEATS = 4;
const SPAN = PERIOD * REPEATS;

/* ViewBox units. Every layer's line rides the middle, so the per-layer strip
   position alone decides where on the hero it sits. */
const HEIGHT = 520;
const MID = HEIGHT / 2;

/*
 * These three are literals on purpose, exactly like FaqArt and CatsArt. The
 * hero's own background is a fixed deep green in campuscoin.css and does NOT
 * follow the theme, so a --cc-* token here would be a luminous mint in the dark
 * theme and a dull, near-invisible teal in the light one. One of the two would
 * always be wrong; a fixed luminous mint is right on both.
 */
const MINT = '#34d399';
const MINT_SOFT = '#a7f3d8';
const TEAL = '#2dd4bf';

const LAYERS = [
  { key: 'a', top: 40, height: 60, amp: 62, width: 4, alpha: 0.3, color: MINT, slide: 26, drift: 17 },
  { key: 'b', top: 52, height: 48, amp: 44, width: 3, alpha: 0.22, color: MINT_SOFT, slide: 34, drift: 23 },
  { key: 'c', top: 30, height: 40, amp: 78, width: 2.6, alpha: 0.16, color: TEAL, slide: 44, drift: 29 },
  { key: 'd', top: 62, height: 38, amp: 26, width: 2, alpha: 0.12, color: MINT, slide: 38, drift: 31 },
];

/**
 * One period, starting and ending level at `y` so the copy that follows joins
 * without a step. The control points are pushed to the crest and the trough
 * rather than eased out to them, which is what makes the line read as water
 * instead of as a sine the eye can count.
 */
function period(x0, y, amp) {
  const q = PERIOD / 4;
  const crest = y - amp;
  const trough = y + amp * 1.1;
  const step = (x, ctrl) =>
    `C${x + q * 0.34} ${ctrl} ${x + q * 0.66} ${ctrl} ${x + q} ${y} `;
  return (
    `M${x0} ${y} ` +
    step(x0, crest) +
    step(x0 + q, trough) +
    step(x0 + q * 2, crest) +
    step(x0 + q * 3, trough)
  );
}

/** The whole strip: the same wave repeated, so the drawing never runs out. */
function wavePath(y, amp) {
  return Array.from({ length: REPEATS }, (_, i) => period(i * PERIOD, y, amp)).join(' ');
}

export default function HeroWaves() {
  return (
    <div className="lp2-waves" aria-hidden="true">
      {LAYERS.map((layer) => (
        <div
          key={layer.key}
          className="lp2-wave"
          style={{
            position: 'absolute',
            insetInlineStart: 0,
            insetInlineEnd: 0,
            top: `${layer.top}%`,
            height: `${layer.height}%`,
            // the slow vertical breath. `lp-bob` is the landing's own bob, so
            // this costs no new keyframe; only the tempo is ours, and the
            // negative delays keep the four layers out of step with each other.
            // duration and delay only - the stylesheet owns the name and the
            // timing function, so one `prefers-reduced-motion` block can switch
            // this off. An inline `animation` shorthand would beat that media
            // query, and the preference would be quietly ignored.
            animationDuration: `${layer.drift}s`,
            animationDelay: `${-layer.drift * 0.37}s`,
            willChange: 'transform',
          }}
        >
          <svg
            className="lp2-wave-svg"
            viewBox={`0 0 ${SPAN} ${HEIGHT}`}
            preserveAspectRatio="none"
            focusable="false"
            style={{
              display: 'block',
              // 200% + translate -50% is the loop: the hero sees half the
              // drawing, and half the drawing is a whole number of waves.
              width: '200%',
              height: '100%',
              animationDuration: `${layer.slide}s`,
              willChange: 'transform',
            }}
          >
            <path
              className="lp2-wave-line"
              d={wavePath(MID, layer.amp)}
              fill="none"
              stroke={layer.color}
              strokeWidth={layer.width}
              strokeOpacity={layer.alpha}
              strokeLinecap="round"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
