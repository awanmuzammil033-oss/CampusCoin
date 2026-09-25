/**
 * HeroWaves — the three flowing lines behind the hero copy.
 *
 * They used to be a background image with preserveAspectRatio="none", which
 * squashed the curves until they read as three straight rules across the
 * middle of the hero. Each line is now a real path whose period matches its
 * own travel distance, so the drift loops forever with no jump: the SVG is
 * two wave periods wide and the animation moves exactly one period.
 */
const LAYERS = [
  { key: 'w1', y: 300, amp: 58, dur: 26, width: 2.2, opacity: 0.45, color: 'rgb(52,211,153)' },
  { key: 'w2', y: 386, amp: 74, dur: 34, width: 1.8, opacity: 0.3, color: 'rgb(167,243,208)' },
  { key: 'w3', y: 226, amp: 44, dur: 44, width: 1.5, opacity: 0.24, color: 'rgb(45,212,191)' },
];

/** One period: starts and ends at the same height with the same slope. */
function path(y, amp) {
  const up = y - amp;
  const down = y + amp * 1.2;
  const one = `C100 ${up} 200 ${up} 300 ${y} C400 ${down} 500 ${down} 600 ${y}`;
  return `M0 ${y} ${one} C700 ${up} 800 ${up} 900 ${y} C1000 ${down} 1100 ${down} 1200 ${y}`;
}

export default function HeroWaves() {
  return (
    <div className="lp2-waves" aria-hidden="true">
      <svg className="lp2-waves-svg" viewBox="0 0 1200 520" preserveAspectRatio="none" focusable="false">
        {LAYERS.map((layer, i) => (
          <path
            key={layer.key}
            className={`lp2-wave lp2-wave-${i + 1}`}
            d={path(layer.y, layer.amp)}
            fill="none"
            stroke={layer.color}
            strokeWidth={layer.width}
            strokeOpacity={layer.opacity}
            strokeLinecap="round"
            style={{ animationDuration: `${layer.dur}s`, animationDirection: i === 1 ? 'reverse' : 'normal' }}
          />
        ))}
      </svg>
    </div>
  );
}
