/**
 * Reference exchange rates — DISPLAY ONLY.
 *
 * Why a bundled table and not a live feed: this project has no rate service,
 * and inventing a number would be lying about somebody's money. So the rates
 * below are a dated snapshot (see FX_AS_OF) shipped with the app, and the UI
 * says so wherever a conversion is actually applied. Pick a currency with no
 * rate here and the amount is shown exactly as it was entered, with a note —
 * never silently re-labelled.
 *
 * Units: how many units of the currency equal 1 USD.
 *
 * This is a student tracker: stored amounts never change, only the way they
 * are displayed. The student's own currency (their ledger currency) is what
 * the amounts in the database are denominated in; the topbar picker chooses
 * what they are shown in.
 */
export const FX_AS_OF = '2026-09-25';

export const USD_RATES = {
  USD: 1,

  // majors
  EUR: 0.92, GBP: 0.79, JPY: 152, CHF: 0.88, CAD: 1.37, AUD: 1.52, NZD: 1.64,
  CNY: 7.2, HKD: 7.8, SGD: 1.34, TWD: 32.5, KRW: 1380, INR: 83, IDR: 16200,
  MYR: 4.45, PHP: 58, THB: 34.5, VND: 25400, ILS: 3.7, AED: 3.67, SAR: 3.75,
  QAR: 3.64, KWD: 0.307, BHD: 0.377, OMR: 0.385, JOD: 0.709, EGP: 48.5,
  MAD: 9.9, DZD: 134, LYD: 4.83, TND: 3.1, IQD: 1310, IRR: 42000, AFN: 72,

  // south + central asia
  PKR: 278, BDT: 117, NPR: 133, LKR: 305, BTN: 83, MVR: 15.4, KZT: 490,
  UZS: 12600, TMT: 3.5, KGS: 89, MNT: 3450, MMK: 2100,

  // africa
  NGN: 1550, KES: 129, TZS: 2680, UGX: 3750, ZAR: 18.2, ZMW: 27.5, BWP: 13.8,
  NAD: 18.2, MZN: 64, AOA: 915, XOF: 607, XAF: 607, CDF: 2700, RWF: 1330,
  ETB: 132, GHS: 15.5, SDG: 600, SOS: 571, DJF: 177, ERN: 15, MWK: 1750,
  MZN2: 64, SZL: 18.2, LSL: 18.2, CVE: 102, GMD: 68, DJF2: 177,

  // europe
  SEK: 10.5, NOK: 10.7, DKK: 6.87, PLN: 4, CZK: 23.2, HUF: 360, RON: 4.6,
  BGN: 1.8, HRK: 6.87, RUB: 92, UAH: 41, TRY: 34, GEL: 2.7, AMD: 396,
  ALL: 94, MKD: 52, RSD: 107, ISK: 138,

  // americas
  BRL: 5.4, MXN: 18, ARS: 950, CLP: 950, COP: 4200, PEN: 3.75, UYU: 38,
  VES: 36, BOB: 6.9, PYG: 7300, DOP: 61, GTQ: 7.85, HNL: 24.7, CRC: 510,
  JMD: 156, TTD: 6.8, BBD: 2, BSD: 1, BMD: 1, BZD: 2, XCD: 2.7, FJD: 2.24,
  GYD: 209, HTG: 132, SBD: 8.4, SRD: 3.4, PAB: 1,

  // oceania + small economies
  PGK: 3.6, WST: 2.75, VUV: 119, XPF: 107, SHP: 0.79, FKP: 0.79, GIP: 0.79,
  LBP: 89500, SYP: 12900, YER: 250, SLL: 22000, SLE: 22, STN: 22, ZWL: 13.4,
  ZWG: 13.4, VES2: 36, BYN: 3.2, TJS: 10.9, AOA2: 915, MRO: 39.8, MRU: 39.8,
};

/** Do we have a rate for this currency? Unknown ones are shown unconverted. */
export function hasRate(code) {
  return Boolean(USD_RATES[code]);
}

/**
 * Multiplier that turns an amount in `from` into the same value in `to`.
 * The table is "units per 1 USD", so going from X to Y DIVIDES by X's rate
 * and multiplies by Y's (400 PKR -> 400 / 278 = $1.44). Returns 1 when the
 * pair is unknown — money.js then shows the amount exactly as it was entered
 * instead of guessing.
 */
export function rateBetween(from, to) {
  const a = USD_RATES[from];
  const b = USD_RATES[to];
  if (!a || !b) return 1;
  return b / a;
}
