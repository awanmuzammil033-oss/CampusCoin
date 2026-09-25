/**
 * Shared date formatting that follows the active interface language.
 * locale.jsx sets <html lang> whenever the language changes, so module-level
 * helpers (used by lists and audit trails) can read it from the document
 * without any prop plumbing. Missing lang falls back to English.
 */

/** The interface's current language tag ('tr', 'ur', …), English by default. */
export function uiLang() {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
}

/** "Sep 15, 2026" style row date from a YYYY-MM-DD string. */
export function dayLabel(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(uiLang(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "September 2026" style month heading. */
export function monthLabel(date = new Date()) {
  return date.toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}
