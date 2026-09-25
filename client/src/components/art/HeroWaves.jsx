/**
 * HeroWaves — the calm wave lines behind the hero.
 *
 * First pass: the lines drifted sideways. On a wide screen that read as three
 * ropes sliding through the middle of the hero (right across the headline), and
 * the movement was not smooth — a stretched SVG re-rasterising every frame
 * stutters on a normal laptop, which is worse than no movement at all.
 *
 * So they do not move. These are three static wave paths, drawn once, sitting
 * BEHIND the copy and the mock, weighted to the lower half of the hero so the
 * headline never has to compete with them. Same curves, no motion, no jank —
 * and the radial glow in CSS still gives the hero its depth.
 */
const LAYERS = [
  { key: 'w1', y: 322, amp: 56, width: 2.2, opacity: 0.34, color: 'rgb(52,211,153)' },
  { key: 'w2', y: 398, amp: 70, width: 1.8, opacity: 0.24, color: 'rgb(167,243,208)' },
  { key: 'w3', y: 248, amp: 40, width: 1.5, opacity: 0.18, color: 'rgb(45,212,191)' },
];

/** One smooth period: starts and ends level, so the join is invisible. */
function path(y, amp) {
  const up = y - amp;
  const down = y + amp * 1.15;
  return (
    `M0 ${y} C150 ${up} 300 ${up} 450 ${y} C600 ${down} 750 ${down} 900 ${y} ` +
    `C1050 ${up} 1200 ${up} 1350 ${y} C1500 ${down} 1650 ${down} 1800 ${y}`
  );
}

export default function HeroWaves() {
  return (
    <div className="lp2-waves" aria-hidden="true">
      <svg className="lp2-waves-svg" viewBox="0 0 1800 520" preserveAspectRatio="none" focusable="false">
        {LAYERS.map((layer) => (
          <path
            key={layer.key}
            className="lp2-wave"
            d={path(layer.y, layer.amp)}
            fill="none"
            stroke={layer.color}
            strokeWidth={layer.width}
            strokeOpacity={layer.opacity}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
