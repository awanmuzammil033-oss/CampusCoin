/**
 * Display-only money formatting. The picker in the topbar picks how amounts
 * are SHOWN (symbol, order, decimals) — there is no exchange-rate feed here,
 * so stored amounts are never converted between currencies.
 */

let currency = 'USD';

/** Points money() at a different display currency. Stores it and nothing else. */
export function setDisplayCurrency(code) {
  currency = code;
}

export function getDisplayCurrency() {
  return currency;
}

/**
 * Formats any value as an amount in the current display currency.
 * Always two fraction digits (even for JPY-style zero-decimal currencies) so
 * the ledger keeps one uniform look, and negatives render with a real minus
 * sign (U+2212) in front of the absolute value — "−$12.50" — because every
 * page leans on that exact style.
 */
export function money(value) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0; // NaN / null / undefined → 0
  const negative = safe < 0;
  const amount = Math.abs(safe); // also turns -0 into plain 0

  let formatted;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code for this runtime — still show the amount.
    formatted = `${currency} ${amount.toFixed(2)}`;
  }

  return negative ? `\u2212${formatted}` : formatted;
}
