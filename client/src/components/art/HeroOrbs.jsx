/**
 * HeroOrbs — the lit spheres behind the hero, and the reason the picture in the
 * new mockups looks like the one here.
 *
 * The wave lines were already travelling in place; what the hero was missing was
 * DEPTH. A flat field of one green with four thin lines on it reads as a
 * background, not as a photograph, and every other version of this hero that has
 * looked right has had something in it with a highlight and a shadow side.
 *
 * So: four spheres, each a radial gradient with its own light direction, sitting
 * BEHIND the waves and the phone, drifting on their own slow timers. Nothing here
 * is a picture file - a gradient is a gradient - which is why the file has no
 * drawing in it and the light theme is the same as the dark one.
 *
 * Why they are in the component and not the stylesheet: each orb's size, corner,
 * colour and timing is part of the composition, and a stylesheet rule cannot hold
 * eight numbers per orb without becoming unreadable. The stylesheet owns the ONE
 * thing it must own - the animation name, the timing function, the iteration
 * count and the `prefers-reduced-motion` off-switch - and the markup owns the
 * rest, exactly as HeroWaves does.
 *
 * Nothing about them is load-bearing: if the stylesheet's rules are missing the
 * orbs are simply still spheres behind the headline, and the copy is unaffected.
 */

/* A fixed palette on purpose, for the reason HeroWaves gives: these sit on a
   deep green that does not follow the theme, so a --cc-* token would be a
   luminous mint in the dark theme and a near-invisible teal in the light one. */
const ORBS = [
  {
    key: 'gold',
    // bottom left, half out of frame: the warm one, and the one that stops the
    // hero from being entirely green
    at: { bottom: '-26%', insetInlineStart: '-16%' },
    width: '62%',
    aspect: '1',
    inner: 'rgba(253, 224, 71, 0.95)',
    mid: 'rgba(217, 119, 6, 0.55)',
    alpha: 0.78,
    dur: 19,
    delay: -6,
    // the light comes from the top right of this one
    light: '130% 90%',
  },
  {
    key: 'mint',
    at: { bottom: '-22%', insetInlineEnd: '-10%' },
    width: '52%',
    aspect: '1',
    inner: 'rgba(110, 231, 183, 0.9)',
    mid: 'rgba(5, 150, 105, 0.5)',
    alpha: 0.66,
    dur: 23,
    delay: -11,
    light: '100% 100%',
  },
  {
    key: 'teal',
    at: { top: '-20%', insetInlineEnd: '12%' },
    width: '42%',
    aspect: '1',
    inner: 'rgba(94, 234, 212, 0.8)',
    mid: 'rgba(13, 148, 136, 0.42)',
    alpha: 0.5,
    dur: 27,
    delay: -3,
    light: '120% 80%',
  },
  {
    key: 'deep',
    at: { top: '10%', insetInlineStart: '20%' },
    width: '46%',
    aspect: '1',
    inner: 'rgba(52, 211, 153, 0.62)',
    mid: 'rgba(6, 78, 59, 0.38)',
    alpha: 0.42,
    dur: 31,
    delay: -17,
    light: '110% 70%',
  },
];

export default function HeroOrbs() {
  return (
    <div className="lp2-orbs" aria-hidden="true">
      {ORBS.map((orb) => (
        <span
          key={orb.key}
          className={`lp2-orb lp2-orb-${orb.key}`}
          style={{
            position: 'absolute',
            ...orb.at,
            width: orb.width,
            aspectRatio: orb.aspect,
            borderRadius: '50%',
            background: `radial-gradient(circle at ${orb.light}, ${orb.inner} 0%, ${orb.mid} 46%, transparent 70%)`,
            // a sphere is not a flat circle: the edge is darkened, so the shape
            // reads as lit from one side even though it is a gradient
            boxShadow: `inset -18px -22px 60px rgba(2, 20, 16, 0.45), inset 14px 16px 40px rgba(255, 255, 255, 0.10)`,
            filter: 'blur(1px)',
            opacity: orb.alpha,
            pointerEvents: 'none',
            // duration and delay only - the stylesheet owns the name, the timing
            // function and the iteration count, so one prefers-reduced-motion
            // block can switch all four off at once
            animationDuration: `${orb.dur}s`,
            animationDelay: `${orb.delay}s`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
