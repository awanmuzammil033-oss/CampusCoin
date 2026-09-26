import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

/**
 * The site-wide converter (ADV-1).
 *
 * The interesting behaviour is not the arithmetic, it is the honesty: the
 * server caches, says where the numbers came from, falls back to a dated table
 * when the free feed is unreachable, and refuses a pair it cannot honestly
 * answer instead of inventing a number.
 */

let ctx;
let fx; // services/fxRates.js — imported lazily, see below

test.before(async () => {
  ctx = await startApp();
  // A top-level import of anything under src/ would evaluate config/env.js
  // before startApp() has set MONGODB_URI.
  fx = await import('../src/services/fxRates.js');
});

test.after(async () => {
  await ctx.stop();
});

/* --------------------------------- helpers ---------------------------------- */

/**
 * A stand-in for the upstream fetch. It answers in the shape the service's own
 * fetchLive() produces — { rates, asOf } — not the raw feed's body, because the
 * service is what the test is about.
 */
function liveFetcher(asOf = '2026-09-26', rates = { EUR: 0.91, GBP: 0.78, PKR: 281 }) {
  return async () => ({ rates, asOf });
}

function countingFetcher(rates) {
  const state = { calls: 0 };
  state.fn = async () => {
    state.calls += 1;
    return { rates, asOf: '2026-09-26' };
  };
  return state;
}

/* ------------------------------ where it gets its numbers -------------------- */

test('a live feed is used, and the response says so', async () => {
  fx.resetRateCache();
  const table = await fx.rateTable({ fetcher: liveFetcher(), allowNetwork: true });

  assert.equal(table.source, 'live', 'the caller is told the numbers are live');
  assert.equal(table.base, 'USD', 'every rate is quoted against one base');
  assert.equal(table.asOf, '2026-09-26', 'the feed dates the table, not us');
  assert.equal(table.rates.EUR, 0.91, 'the live figure is the one served');
  assert.equal(table.rates.USD, 1, 'the base itself is always in the table');

  // The feed carries about thirty currencies and no PKR. Rather than lose the
  // rupee the moment the network is up, the dated table sits underneath the live
  // numbers, and the codes that came from there are named so the popover can
  // label them as a snapshot instead of as a live rate.
  assert.equal(table.rates.PKR > 0, true, 'PKR is still convertible while the feed is live');
  assert.equal(
    table.referenceOnly.includes('EUR'),
    false,
    'a currency the feed DID carry is not labelled as a snapshot',
  );
  assert.equal(
    table.referenceOnly.includes('BDT'),
    true,
    'a currency only the dated table has is labelled as one',
  );
  assert.equal(
    table.referenceOnly.includes('USD'),
    false,
    'the base is not a snapshot: the feed quotes everything against it, so it never appears in its own payload',
  );
});

test('a second request is served from the cache without touching the feed again', async () => {
  fx.resetRateCache();
  const fetcher = countingFetcher({ EUR: 0.91 });

  const first = await fx.rateTable({ fetcher: fetcher.fn, allowNetwork: true });
  const second = await fx.rateTable({ fetcher: fetcher.fn, allowNetwork: true });

  assert.equal(fetcher.calls, 1, 'the upstream is called once, not once per visitor');
  assert.equal(first.source, 'live');
  assert.equal(second.source, 'cache', 'a cached answer is reported as a cached answer');
  assert.equal(second.rates.EUR, 0.91, 'and it is the same number');
  assert.ok(second.cached, 'the response is flagged so the UI can say "as of"');
});

test('when the feed is down the dated table is served, and every row is labelled', async () => {
  fx.resetRateCache();
  const boom = async () => {
    throw new Error('network is down');
  };

  const table = await fx.rateTable({ fetcher: boom, allowNetwork: true });

  assert.equal(table.source, 'reference', 'an offline table is never passed off as live');
  assert.equal(table.asOf, fx.REFERENCE_AS_OF, 'and it carries its own date');
  assert.equal(table.rates.PKR > 0, true, 'the student currencies are in the bundled table');
  assert.equal(
    table.referenceOnly.includes('PKR'),
    true,
    'a reference figure is listed as one, so the popover can say so',
  );
  assert.equal(table.referenceOnly.length, Object.keys(table.rates).length);
});

test('a feed that fails after a good one still leaves the good numbers standing', async () => {
  fx.resetRateCache();
  await fx.rateTable({ fetcher: liveFetcher('2026-09-26', { EUR: 0.91, PKR: 281 }), allowNetwork: true });

  const boom = async () => {
    throw new Error('network is down');
  };
  const table = await fx.rateTable({ fetcher: boom, allowNetwork: true });

  assert.equal(table.source, 'cache', 'the last good table is kept for a day');
  assert.equal(table.rates.PKR, 281, 'a live currency does not vanish because the feed blinked');
  assert.equal(table.asOf, '2026-09-26', 'and the old date is shown, not a fresh one');
});

test('a feed that answers with rubbish is treated as no answer', async () => {
  fx.resetRateCache();
  const rubbish = async () => ({ notRates: true, asOf: '2026-09-26' });
  const table = await fx.rateTable({ fetcher: rubbish, allowNetwork: true });

  assert.equal(table.source, 'reference', 'garbage in the response never becomes rates out');
  assert.equal(table.rates.EUR > 0, true, 'the bundled table is what is served');
});

test('with networking switched off nothing is fetched at all', async () => {
  fx.resetRateCache();
  let called = 0;
  const spy = async () => {
    called += 1;
    return { rates: { EUR: 1 }, date: '2026-09-26' };
  };

  const table = await fx.rateTable({ fetcher: spy, allowNetwork: false });
  assert.equal(called, 0, 'the test suite never reaches the internet');
  assert.equal(table.source, 'reference');
});

/* --------------------------------- the arithmetic ---------------------------- */

test('a conversion is a cross-rate, rounded to whole cents', () => {
  const rates = { USD: 1, EUR: 0.92, PKR: 278, JPY: 152 };

  const pkr = fx.convert(278, 'PKR', 'USD', rates);
  assert.equal(pkr.result, 1, '278 PKR is a dollar at this table');
  assert.equal(pkr.from, 'PKR');
  assert.equal(pkr.to, 'USD');

  const usdToEur = fx.convert(100, 'USD', 'EUR', rates);
  assert.equal(usdToEur.result, 92, 'a hundred dollars is ninety-two euros at this table');
  assert.equal(usdToEur.rate, 0.92, 'and the quoted rate is the one used');

  // Both sides matter: the rate is stored per dollar, so a rupee-to-yen
  // conversion has to go through the dollar and cannot be a straight multiply.
  const cross = fx.convert(27800, 'PKR', 'JPY', rates);
  assert.equal(cross.result, 15200, '27800 PKR crosses the dollar and lands on yen');
});

test('a pair the table cannot answer is refused, never guessed', () => {
  const rates = { USD: 1, EUR: 0.92 };

  assert.equal(fx.convert(100, 'PKR', 'USD', rates), null, 'an unknown source currency has no rate');
  assert.equal(fx.convert(100, 'USD', 'PKR', rates), null, 'an unknown target currency has no rate');
  assert.equal(fx.convert(100, 'USD', 'USD', rates), null, 'the same currency twice is not a conversion');
  assert.equal(fx.convert(100, 'USD', 'EUR', { USD: 1, EUR: 0 }), null, 'a zero rate is not a rate');
});

test('nonsense amounts are refused rather than turned into a number', () => {
  const rates = { USD: 1, EUR: 0.92 };

  assert.equal(fx.convert('abc', 'USD', 'EUR', rates), null);
  assert.equal(fx.convert('', 'USD', 'EUR', rates), null);
  assert.equal(fx.convert(-5, 'USD', 'EUR', rates), null, 'a negative amount is not an amount');
  assert.equal(fx.convert(undefined, 'USD', 'EUR', rates), null);
});

test('currency codes are matched whatever case the browser sends', () => {
  const rates = { USD: 1, EUR: 0.92 };
  const result = fx.convert(50, 'usd', 'eur', rates);
  assert.equal(result.from, 'USD');
  assert.equal(result.to, 'EUR');
  assert.equal(result.result, 46);
});

/* ----------------------------------- the route ------------------------------- */

test('the converter answers a signed-out visitor, because the button is in the public navbar', async () => {
  const agent = ctx.newAgent();

  const rates = await agent.get('/api/fx/rates');
  assert.equal(rates.status, 200);
  assert.equal(rates.body.base, 'USD');
  assert.ok(rates.body.rates.PKR > 0, 'PKR is a first-class currency here');
  assert.ok(Array.isArray(rates.body.featured), 'the popover is told what to offer first');
  assert.ok(rates.body.asOf, 'and how old the numbers are');

  const converted = await agent.get('/api/fx/convert?amount=500&from=PKR&to=USD');
  assert.equal(converted.status, 200);
  assert.equal(converted.body.result > 0, true);
  assert.equal(converted.body.asOf, rates.body.asOf, 'both answers come from one table');
});

test('the route refuses an impossible pair with a 400 and a readable sentence', async () => {
  const agent = ctx.newAgent();

  const missing = await agent.get('/api/fx/convert?amount=100&from=USD&to=ZZZ');
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /rate table/i, 'the browser is told why, in words');
  assert.ok(missing.body.featured, 'and offered currencies that do work');

  const junk = await agent.get('/api/fx/convert?amount=abc&from=PKR&to=USD');
  assert.equal(junk.status, 400, 'an amount that is not a number is not silently zero');
});

test('the service is a calculator and nothing more', () => {
  // The whole point of the feature: it reads a rate table and does arithmetic.
  // There is no write path here, so no conversion can ever be written onto a
  // transaction, a budget or a display preference.
  assert.deepEqual(
    Object.keys(fx).sort(),
    ['FEATURED', 'REFERENCE_AS_OF', 'convert', 'getRates', 'rateTable', 'resetRateCache'],
    'the public surface of the service is a table, a converter and a cache reset',
  );
});
