import mongoose from 'mongoose';

/**
 * Money rules for the whole project:
 *  - stored in MongoDB as Decimal128 (base-10, no float drift in totals),
 *  - summed/averaged inside the database, never by looping rows in JS,
 *  - converted to a plain number only at the JSON boundary, rounded to
 *    two decimals so what the client sees always matches what is stored.
 */

export function toDec(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value;
  if (!Number.isFinite(n)) return null;
  return mongoose.Types.Decimal128.fromString(n.toFixed(2));
}

export function toNum(dec) {
  if (dec === null || dec === undefined) return null;
  if (typeof dec === 'number') return dec;
  const raw = dec.$numberDecimal !== undefined ? dec.$numberDecimal : dec.toString();
  const n = Number(raw);
  return Number.isFinite(n) ? round2(n) : 0;
}

/** Round once at the API edge so 12.3450000000001 never reaches the UI. */
export function round2(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
}

/** Display helper: 12 -> "12.00", 12.5 -> "12.50" */
export function formatMoney(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** True when the string parses to a positive amount with at most 2 decimals. */
export function isPositiveAmount(value) {
  const s = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
  return Number(s) > 0;
}
