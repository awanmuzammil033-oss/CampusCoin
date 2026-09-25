/**
 * Chart colours (design.md §5).
 *
 * Canvas cannot read CSS custom properties — `ctx.fillStyle = 'var(--x)'`
 * is an invalid colour, so every chart drawn with raw tokens came out
 * black. These helpers turn a token back into the value the stylesheet
 * resolves it to right now, which keeps charts in step with the light
 * and dark themes and re-resolves whenever the theme flips.
 */

/* Documented colour of each token, used when getComputedStyle is off-stage. */
const FALLBACKS = {
  '--cc-chart-1': '#0f766e',
  '--cc-chart-2': '#f5b400',
  '--cc-chart-3': '#c2410c',
  '--cc-chart-4': '#2563eb',
  '--cc-chart-5': '#7c3aed',
  '--cc-chart-6': '#db2777',
  '--cc-chart-7': '#65a30d',
  '--cc-chart-8': '#64748b',
  '--cc-surface': '#ffffff',
  '--cc-text': '#16211f',
  '--cc-muted': '#5b6b67',
  '--cc-income': '#15803d',
  '--cc-expense': '#c2410c',
};

/** 'var(--cc-chart-2)' - the colour that token is right now ('#f5b400'). */
export function cssColor(token) {
  if (typeof token !== 'string' || !token.startsWith('var(')) return token;
  const name = token.slice(token.indexOf('(') + 1, token.indexOf(')')).trim();
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) return value;
  } catch {
    /* no document — fall through to the documented colour */
  }
  return FALLBACKS[name] || token;
}

/** Transparency for a plain #rrggbb colour; any other colour passes through. */
export function withAlpha(color, alpha) {
  const hex = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!hex) return color;
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hex[1]}${channel}`;
}

/**
 * One colour per category, stable across every chart and reload: the
 * default catalogue keeps a hand-picked slot (Food is yellow — the colour
 * students already associate with it), and anything renamed or added
 * keeps a colour via a name hash instead of reshuffling each month.
 */
const NAMED = {
  // expense
  food: '--cc-chart-2', // yellow
  transport: '--cc-chart-4', // blue
  'hostel/rent': '--cc-chart-5', // violet
  academics: '--cc-chart-1', // teal
  subscriptions: '--cc-chart-6', // pink
  entertainment: '--cc-chart-3', // orange
  miscellaneous: '--cc-chart-8', // slate
  // income
  allowance: '--cc-chart-7', // green
  'part-time job': '--cc-chart-4',
  scholarship: '--cc-chart-5',
  gift: '--cc-chart-6',
  'other income': '--cc-chart-8',
};

/** The token for a category's colour — ChartCard resolves it before drawing. */
export function categoryColor(name) {
  const key = String(name || '')
    .trim()
    .toLowerCase();
  if (NAMED[key]) return `var(${NAMED[key]})`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `var(--cc-chart-${(hash % 8) + 1})`;
}
