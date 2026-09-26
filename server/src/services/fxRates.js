import env from '../config/env.js';

/**
 * Exchange rates for the site-wide converter (ADV-1).
 *
 * Three sources, in order of preference, and the service always says which
 * one it used:
 *
 *  1. LIVE   — the free, key-less Frankfurter service (an ECB feed). Fetched
 *              at most once every CACHE_TTL_MS, and every later request is
 *              answered from memory: the navbar converter is on every page, so
 *              the upstream must not be hit per visitor.
 *  2. CACHED — the last good live table, kept for a day after a fetch starts
 *              failing, so a flaky network does not blank the rates.
 *  3. REFERENCE — a dated table shipped with the app. Frankfurter publishes
 *              around thirty currencies and has no PKR, BDT, NPR or NGN, and
 *              this project's students live in those economies: rather than
 *              pretend, the bundled snapshot covers them and the API reports
 *              which currencies those are, so the page can label them.
 *
 * Nothing here ever rewrites a stored amount. This service is a calculator for
 * the converter popover; the ledger's own display conversion keeps using the
 * client's dated table (see client/src/data/fx.js) and never a network call.
 */

const FRANKFURTER = 'https://api.frankfurter.app/latest?from=USD';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // six hours — a rate is not news
const STALE_MS = 24 * 60 * 60 * 1000; // keep serving the last good table this long
const FETCH_TIMEOUT_MS = 4000;

/** Units of each currency per 1 USD. Dated, and labelled as reference. */
export const REFERENCE_AS_OF = '2026-09-25';

const REFERENCE_RATES = {
  USD: 1,
  EUR: 0.92, GBP: 0.79, CHF: 0.88, JPY: 152, CAD: 1.37, AUD: 1.52, NZD: 1.64,
  CNY: 7.2, HKD: 7.8, SGD: 1.34, KRW: 1380, INR: 83, IDR: 16200, MYR: 4.45,
  PHP: 58, THB: 34.5, VND: 25400, ILS: 3.7, AED: 3.67, SAR: 3.75, QAR: 3.64,
  KWD: 0.307, BHD: 0.377, OMR: 0.385, JOD: 0.709, EGP: 48.5, MAD: 9.9,
  PKR: 278, BDT: 117, NPR: 133, LKR: 305, BTN: 83, AFN: 72,
  NGN: 1550, KES: 129, TZS: 2680, UGX: 3750, ZAR: 18.2, GHS: 15.5, ETB: 132,
  TRY: 34.5, RUB: 92, BRL: 5.4, MXN: 18.5, PLN: 3.95, SEK: 10.5, NOK: 10.7,
  DKK: 6.85, CZK: 22.8, HUF: 355, RON: 4.6, BGN: 1.8, HRK: 6.9,
  LBP: 89500, IQD: 1310, JMD: 156, TTD: 8.3, DZD: 134, TND: 3.1, LYD: 4.83,
};

/** The currencies a student here is most likely to convert between. */
export const FEATURED = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'INR', 'BDT', 'TRY', 'CNY', 'JPY'];

/* --------------------------------- cache ---------------------------------- */

let cache = null; // { rates, asOf, source, fetchedAt }
let inflight = null; // one shared fetch, however many visitors arrive

const isFresh = (entry) => entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;

/** Live fetch, with a hard timeout so a hanging upstream cannot stall a request. */
async function fetchLive() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FRANKFURTER, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`upstream said ${res.status}`);
    const body = await res.json();
    return { rates: body?.rates, asOf: String(body?.date || '') };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A response is only usable if it is a table of positive numbers. Anything
 * else - an error page that parsed as JSON, an empty object, a string where a
 * rate should be - counts as no answer at all, because a wrong number shown as
 * a live rate is worse than an old one shown honestly as a snapshot.
 */
function usableRates(rates) {
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) return null;
  const clean = {};
  for (const [code, value] of Object.entries(rates)) {
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(n) && n > 0) clean[code] = n;
  }
  return Object.keys(clean).length ? clean : null;
}

/**
 * The rates to serve, fetching only when the cache is cold or stale.
 * `fetcher` is injectable so the tests never touch the network.
 */
export async function getRates({ fetcher = fetchLive, allowNetwork = env.nodeEnv !== 'test' } = {}) {
  if (isFresh(cache)) return { ...cache, source: cache.source === 'live' ? 'cache' : cache.source };

  if (inflight) return inflight;

  inflight = (async () => {
    if (allowNetwork) {
      try {
        const live = await fetcher();
        const fresh = usableRates(live?.rates);
        if (!fresh) throw new Error('the feed sent no usable rates');
        // The live numbers win, but they only cover about thirty currencies and
        // the students here convert PKR, BDT, NPR and NGN. So the dated table
        // sits underneath as a floor instead of being thrown away, and every
        // code that came from it is remembered, so the popover can label those
        // figures as a snapshot rather than as a live rate.
        cache = {
          rates: { ...REFERENCE_RATES, ...fresh, USD: 1 },
          // USD is excluded on purpose: the feed quotes every other currency
          // against the dollar, so the base never appears in its own payload and
          // asking "was this in the feed?" would wrongly call it a snapshot.
          referenceOnly: Object.keys(REFERENCE_RATES).filter((code) => code !== 'USD' && !(code in fresh)),
          asOf: live.asOf || REFERENCE_AS_OF,
          source: 'live',
          fetchedAt: Date.now(),
        };
        return { ...cache, source: 'live' };
      } catch {
        // fall through to whatever we already had
      }
    }

    // A table we fetched before is still better than nothing for a day.
    if (cache && Date.now() - cache.fetchedAt < STALE_MS) {
      return { ...cache, source: 'cache' };
    }

    cache = {
      rates: { ...REFERENCE_RATES },
      referenceOnly: Object.keys(REFERENCE_RATES),
      asOf: REFERENCE_AS_OF,
      source: 'reference',
      fetchedAt: Date.now(),
    };
    return { ...cache };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Everything the popover needs, with the honest bookkeeping attached. */
export async function rateTable(options = {}) {
  const { rates, asOf, source, referenceOnly } = await getRates(options);
  return {
    base: 'USD',
    asOf,
    source,
    rates,
    featured: FEATURED.filter((code) => code in rates || code in REFERENCE_RATES),
    referenceOnly,
    referenceAsOf: REFERENCE_AS_OF,
    cached: isFresh(cache) && source !== 'reference',
  };
}

/**
 * Cross-rate a conversion: everything is stored per 1 USD, so
 * amount ÷ from × to. Both sides must be known, or the answer is null rather
 * than a guess — the popover says "no rate for that pair" instead of showing a
 * number nobody should trust.
 */
export function convert(amount, from, to, rates) {
  // `Number('')` is 0, so a blank field would otherwise be reported as a
  // confident conversion of nothing. A blank is not an amount.
  if (amount === null || amount === undefined || String(amount).trim() === '') return null;
  const value = Number(amount);
  const a = String(from || '').toUpperCase();
  const b = String(to || '').toUpperCase();
  if (!Number.isFinite(value) || value < 0 || !a || !b || a === b) return null;
  const fromRate = Number(rates[a]);
  const toRate = Number(rates[b]);
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;

  const inUsd = value / fromRate;
  const out = inUsd * toRate;
  const rate = toRate / fromRate;
  return {
    amount: value,
    from: a,
    to: b,
    result: Math.round(out * 100) / 100,
    rate: Math.round(rate * 1e6) / 1e6,
  };
}

/** Test seam: forget the cache. */
export function resetRateCache() {
  cache = null;
  inflight = null;
}
