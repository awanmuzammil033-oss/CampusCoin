import { rateBetween, hasRate, FX_AS_OF } from './data/fx.js';

/**
 * Money formatting and DISPLAY-ONLY conversion.
 *
 * Two currencies are in play and they are NOT the same thing:
 *
 *  - the LEDGER currency — what the student's amounts are actually in. The
 *    numbers stored in Mongo are denominated in it (400 means 400 rupees).
 *  - the DISPLAY currency — what the topbar picker shows. Switching it to USD
 *    has to show 400 PKR as ~$1.44, not relabel "400" as "400 dollars".
 *
 * Nothing in the database is ever rewritten: conversion happens in the reader,
 * with the dated reference table in data/fx.js. Where no rate is bundled for a
 * currency the amount is shown exactly as entered — relabelling a number you
 * cannot convert would be worse than leaving it alone.
 */

let currency = 'USD'; // display
let ledger = 'USD'; // what the stored amounts are in
let symbolCache = null;
let ledgerSymbolCache = null;

// Charts draw raw numbers, so they have to be told when the display currency
// changes; without this a converted dashboard would keep its old axis.
const listeners = new Set();

/** Subscribe to display/ledger currency changes. Returns an unsubscribe fn. */
export function onCurrencyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function symbolOf(code) {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || code;
  } catch {
    return code;
  }
}

/** Points the formatter at a display currency (and, optionally, the ledger's). */
export function setDisplayCurrency(code, ledgerCode) {
  currency = code || currency;
  if (ledgerCode) ledger = ledgerCode;
  symbolCache = null;
  ledgerSymbolCache = null;
  notify();
}

/** The student's own currency — the unit the entry form asks for. */
export function setLedgerCurrency(code) {
  if (code) ledger = code;
  ledgerSymbolCache = null;
  notify();
}

export function getDisplayCurrency() {
  return currency;
}

export function getLedgerCurrency() {
  return ledger;
}

/** Is a conversion actually happening (and can we do it)? */
export function isConverting() {
  return ledger !== currency && hasRate(ledger) && hasRate(currency);
}

export function canConvert() {
  return hasRate(ledger) && hasRate(currency);
}

/** "1 PKR = 0.0036 USD" — plain, language-neutral (the labels around it are translated). */
export function rateLine() {
  if (ledger === currency) return '';
  if (!canConvert()) return `${ledger}/${currency}`;
  const r = rateBetween(ledger, currency);
  const pretty = r >= 0.01 ? String(Number(r.toFixed(4))) : String(Number(r.toPrecision(3)));
  return `1 ${ledger} = ${pretty} ${currency}`;
}

/**
 * Everything a component needs to explain the conversion in the reader's own
 * language: rateInfo().ok says whether a real conversion is happening.
 */
export function rateInfo() {
  return {
    from: ledger,
    to: currency,
    rate: canConvert() ? rateBetween(ledger, currency) : 1,
    date: FX_AS_OF,
    same: ledger === currency,
    ok: canConvert(),
    line: rateLine(),
  };
}

/** The numeric value a stored amount is worth in the display currency. */
export function convert(value) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  if (ledger === currency || !canConvert()) return safe;
  return safe * rateBetween(ledger, currency);
}

/**
 * Just the symbol/prefix of the DISPLAY currency ("$", "ARS", "€") for chart
 * ticks and other already-converted figures.
 */
export function currencySymbol() {
  if (!symbolCache) symbolCache = symbolOf(currency);
  return symbolCache;
}

/**
 * The symbol of the LEDGER currency — what an input box has to show, because
 * the number the student types there is in their own currency.
 */
export function ledgerCurrencySymbol() {
  if (!ledgerSymbolCache) ledgerSymbolCache = symbolOf(ledger);
  return ledgerSymbolCache;
}

/**
 * Formats a value as an amount in the current display currency, converting
 * from the ledger currency when needed. Always two fraction digits so the
 * ledger keeps one uniform look, and negatives render with a real minus sign
 * (U+2212) in front of the absolute value — "−$12.50" — because every page
 * leans on that exact style.
 */
export function money(value) {
  const converted = convert(value);
  const negative = converted < 0;
  const amount = Math.abs(converted); // also turns -0 into plain 0

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

/**
 * Formats a number the student is TYPING (budget limits, goals, new entries):
 * no conversion, because these are ledger amounts.
 */
export function moneyInLedger(value) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  const negative = safe < 0;
  const amount = Math.abs(safe);
  let formatted;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: ledger,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    formatted = `${ledger} ${amount.toFixed(2)}`;
  }
  return negative ? `\u2212${formatted}` : formatted;
}
