import Icon from './Icon.jsx';

/**
 * CategoryIcon — the one place that turns a category's stored icon key
 * ("wallet", "cup", "bus", …) into a drawn SVG.
 *
 * The key list is data, not decoration: it is what the admin picks per
 * category, what the seed writes and what the DB stores, so the mapping has
 * to live in ONE module. It used to be copy-pasted into five pages as a map
 * of emoji, which is how the same category ended up looking different on the
 * dashboard and in the budget screen.
 */
const ICON_NAMES = {
  wallet: 'wallet',
  cup: 'cup',
  bus: 'bus',
  book: 'book',
  gift: 'gift',
  film: 'film',
  play: 'gamepad',
  house: 'house',
  dots: 'dots',
  award: 'award',
  briefcase: 'briefcase',
  'plus-circle': 'plusCircle',
};

// A few keys had their own glyph before the vector pass: the wallet category
// was a purse, not a money bag, and dots was an ellipsis.
const GLYPH = {
  wallet: '👛',
  dots: '⋯',
};

export function categoryIconName(key) {
  return ICON_NAMES[key] || 'wallet';
}

export default function CategoryIcon({ name, size, className }) {
  return <Icon name={categoryIconName(name)} glyph={GLYPH[name]} size={size} className={className} />;
}
