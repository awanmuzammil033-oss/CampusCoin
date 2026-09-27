/**
 * services/qrpay.js — a payment code, parsed and paid (ADV-6).
 *
 * Three formats are read, because three are what phones put on a counter:
 *
 *   campuscoin://pay?v=1&merchant=Al-Noor Cafeteria&amount=600.00&currency=PKR&note=Lunch&ref=CC123
 *   upi://pay?pa=alnoor@bank&am=600.00&cu=PKR&tn=Lunch&tr=CC123
 *   {"merchant":"Al-Noor Cafeteria","amount":"600.00","currency":"PKR"}
 *
 * The point of doing the parsing HERE rather than in the browser is that the same
 * rules then apply to a camera scan and to a pasted code, and that a malformed
 * code is refused before it can reach the ledger.
 *
 * Two rules this file will not bend:
 *  1. NO GUESSED RATE. The amount is converted with the same cached table the
 *     converter drawer uses, and a pair that table cannot price is refused with a
 *     sentence saying so. A payment is the worst possible place to invent a rate.
 *  2. THE CODE'S OWN AMOUNT IS PRESERVED. `scan.originalAmount` and
 *     `originalCurrency` are written as the code stated them, next to the rate and
 *     the day it was good for, so the transaction can be checked against the
 *     receipt months later.
 */
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import { toDec, toNum, isPositiveAmount, round2 } from '../utils/money.js';
import { rateTable, convert } from './fxRates.js';
import { createTransaction } from './ledger.js';
import { suggest } from './categoriser.js';
import { filteredSummary } from './reports.js';

/** A local calendar day, in the format every service in this app asks for. */
function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Which currency this person's own amounts are in. The client sends the currency
 * it is displaying, and the account is the fallback - so a stale tab still prices
 * a payment in the right money.
 */
function ownCurrency(user, asked) {
  const wanted = String(asked || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(wanted)) return wanted;
  const fromAccount = String(user?.ledgerCurrency || user?.currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(fromAccount) ? fromAccount : 'USD';
}

const MAX_MERCHANT = 120;
const MAX_NOTE = 200;
const MAX_RAW = 400;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/* ------------------------------- the parsing ------------------------------ */

const CODE_MARKERS = ['campuscoin', 'upi', 'pay'];

/**
 * Read a payment code. Returns null for anything that is not one, so a caller can
 * tell "this is not a payment code" from "this code is broken".
 */
export function parsePaymentCode(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.length > MAX_RAW) throw badRequest('That code is far too long to be a payment code.');

  // a JSON payload, for a machine talking to a machine
  if (raw.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw badRequest('That looks like a broken payment code - it opens a brace but does not close.');
    }
    return finish({
      merchant: String(parsed.merchant || parsed.name || '').trim(),
      amount: parsed.amount ?? parsed.am,
      currency: parsed.currency || parsed.cu,
      note: String(parsed.note || parsed.tn || '').trim(),
      reference: String(parsed.ref || parsed.tr || '').trim(),
      raw,
    });
  }

  // a URI of some kind: campuscoin://pay?... or upi://pay?...
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw);
  if (!scheme) return null;
  const kind = scheme[1].toLowerCase();
  if (!CODE_MARKERS.includes(kind)) return null;

  const query = raw.slice(raw.indexOf('?') + 1);
  if (!raw.includes('?')) throw badRequest('That code has no payment details after its address.');
  const params = new URLSearchParams(query);

  return finish({
    merchant: String(
      (kind === 'upi' ? params.get('pn') || params.get('pa') : params.get('merchant')) || ''
    ).trim(),
    amount: kind === 'upi' ? params.get('am') : params.get('amount'),
    currency: kind === 'upi' ? params.get('cu') : params.get('currency'),
    note: String((kind === 'upi' ? params.get('tn') : params.get('note')) || '').trim(),
    reference: String((kind === 'upi' ? params.get('tr') : params.get('ref')) || '').trim(),
    raw,
  });
}

/** The rules every format has to pass, whatever it looked like. */
function finish({ merchant, amount, currency, note, reference, raw }) {
  const name = String(merchant || '').replace(/\s+/g, ' ').trim();
  if (!name) throw badRequest('The code does not say who is being paid.');
  if (name.length > MAX_MERCHANT) throw badRequest('The merchant name in the code is too long.');

  // a currency is three letters, and the amount is money - the same rule the
  // transaction form uses, so a code cannot slip past it
  const code = String(currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw badRequest('The code does not say which currency it is in.');
  }
  if (!isPositiveAmount(amount)) {
    throw badRequest('The amount in the code is not a usable number.');
  }
  if (Number(amount) > 100000000) throw badRequest('That amount is too large to be a payment.');

  return {
    merchant: name,
    amount: round2(Number(amount)),
    currency: code,
    note: String(note || '').slice(0, MAX_NOTE),
    reference: String(reference || '').slice(0, 80),
    raw: String(raw).slice(0, MAX_RAW),
  };
}

/** A readable answer for a camera frame, used by the client before it pays anything. */
export async function readPaymentCode(text, { currency, user } = {}) {
  const parsed = parsePaymentCode(text);
  if (!parsed) throw badRequest('That does not look like a payment code.');

  const target = String(currency || ownCurrency(user) || 'USD').toUpperCase();
  const quote = await quotePayment(parsed, target);
  return { code: parsed, quote };
}

/* -------------------------------- the money -------------------------------- */

/**
 * What the amount is worth in the student's own money, and on what evidence.
 * Returns the rate so the client can show it; returns a refusal rather than a
 * number when the pair cannot be priced.
 */
export async function quotePayment(parsed, targetCurrency) {
  const to = String(targetCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(to)) throw badRequest('Your account currency is not a three-letter code.');

  if (parsed.currency === to) {
    return {
      from: parsed.currency,
      to,
      amount: round2(parsed.amount),
      rate: 1,
      asOf: null,
      source: 'same',
      converted: false,
    };
  }

  const table = await rateTable();
  const amount = convert(parsed.amount, parsed.currency, to, table.rates);
  if (amount === null) {
    throw badRequest(
      `We cannot price ${parsed.currency} in ${to} today, so this payment has not been recorded. Try again later, or enter the amount by hand.`
    );
  }

  return {
    from: parsed.currency,
    to,
    amount: round2(amount),
    // NOT rounded to cents: a rate is a ratio, and PKR->USD is about 0.0036, which
    // round2() would turn into 0.00 - a rate of zero is a lie by accident. Six
    // significant digits is plenty for a receipt and keeps it a number.
    rate: Number((table.rates[to] / table.rates[parsed.currency]).toPrecision(6)),
    asOf: table.asOf,
    source: table.source,
    converted: true,
  };
}

/**
 * Where a payment goes when the name was not recognised: the category this
 * person files most of that type under, and failing that the first default
 * category of that type. A code that was read is money that is already owed -
 * refusing to record it because of a word list would be the worst outcome here.
 */
async function fallbackCategory(user, type) {
  const mostUsed = await Transaction.aggregate([
    { $match: { user: user._id, type, isDeleted: { $ne: true } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  if (mostUsed[0]?._id) return mostUsed[0]._id;

  const first = await Category.findOne({ user: null, isDefault: true, isActive: true, type })
    .select('_id')
    .lean();
  return first?._id || null;
}

/* -------------------------------- the payment ------------------------------ */

/**
 * Pay what the code says: convert it into the student's own currency if it is not
 * already, then record it as an ordinary expense with the scan written onto it.
 *
 * The balance is not a stored number anywhere in this app - it is the sum of the
 * transactions - so recording the expense IS the deduction, and the balance comes
 * back from the same summary the dashboard uses rather than being worked out here.
 * If the payment takes the balance below zero the transaction is still recorded
 * and the caller is told, because a balance going red is information and a silently
 * dropped payment is not.
 */
export async function recordScannedPayment(user, { code, currency, categoryId, date } = {}) {
  const parsed = typeof code === 'string' ? parsePaymentCode(code) : code;
  if (!parsed) throw badRequest('That does not look like a payment code.');

  const target = String(currency || ownCurrency(user) || 'USD').toUpperCase();
  const quote = await quotePayment(parsed, target);

  // the merchant's own name is the best description there is, and the categoriser
  // already knows what words mean money ("canteen" is food) - but the person can
  // change the category on the transaction afterwards, as with any entry
  let category = categoryId;
  let suggestion = null;
  let guessed = false;
  if (!category) {
    try {
      suggestion = await suggest(user, parsed.merchant);
      category = suggestion?.categoryId || null;
      guessed = Boolean(category);
    } catch {
      suggestion = null;
    }
    if (!category) category = await fallbackCategory(user, 'expense');
  }

  const description = [
    parsed.merchant,
    quote.converted ? `(${parsed.amount} ${parsed.currency})` : '',
    parsed.note ? `- ${parsed.note}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 255);

  const txn = await createTransaction(user, {
    type: 'expense',
    amount: String(quote.amount),
    description,
    categoryId: category,
    date: date || new Date(),
    suggestedCategory: suggestion?.categoryId || null,
    suggestionSource: suggestion ? 'keywords' : null,
  });

  // the scan is written straight onto the row rather than through createTransaction,
  // so the audit copy in TransactionHistory stays exactly what every other entry
  // has in it
  txn.scan = {
    merchant: parsed.merchant,
    originalAmount: toDec(parsed.amount),
    originalCurrency: parsed.currency,
    rate: quote.rate,
    rateAsOf: quote.asOf || '',
    rateSource: quote.source || '',
    reference: parsed.reference,
    raw: parsed.raw,
  };
  await txn.save();

  // the summary service reads its window as YYYY-MM-DD strings, so a Date is not
  // passed here: it would serialise to a locale string and be refused
  const summary = await filteredSummary(user, {
    from: isoDay(new Date()),
    to: isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)),
  });

  return {
    transaction: txn.toPublic(),
    scan: {
      merchant: parsed.merchant,
      note: parsed.note,
      reference: parsed.reference,
      originalAmount: parsed.amount,
      originalCurrency: parsed.currency,
    },
    quote,
    category: { id: category ? String(category) : null, guessed, fallback: !guessed && !categoryId },
    balance: summary?.totals?.balance ?? null,
    belowZero: (summary?.totals?.balance ?? 0) < 0,
  };
}
