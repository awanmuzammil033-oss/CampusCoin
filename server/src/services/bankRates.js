import mongoose from 'mongoose';
import BankRate from '../models/BankRate.js';
import { toDec, toNum, round2, isPositiveAmount } from '../utils/money.js';

/**
 * Compare Savings Options (ADV-3): a reference table of savings-account and
 * Fixed Deposit rates, kept by administrators and read by students.
 *
 * The whole module is written to one rule — this is a snapshot, not advice:
 *  - it never ranks two products as "better for you", only as "higher number
 *    in this column". The "best rate" marker says the same thing in the only
 *    way it can honestly be said: the highest figure this bank publishes for
 *    this product type. No comparison across banks, no recommendation, no
 *    projection of what a rate will do;
 *  - nothing is personalised. The rows are shared reference data with no
 *    owner, so there is no per-user scoping here at all — the only guard on
 *    the write side is `requireAdmin` on the admin router;
 *  - every list, marker and headline number is produced by an aggregation
 *    pipeline, never by looping rows in JavaScript, so the table stays cheap
 *    and every figure shown is the one the database computed;
 *  - the disclaimer is not stored here. It lives in the dictionary
 *    (`sav.disclaimer`) so the page, the admin form and any print of the page
 *    all read the same sentence and no future edit can quietly change it in
 *    one place only.
 */

const ACCOUNT_TYPES = ['savings', 'fd'];

/** Whitelisted sort orders — a query string must never reach Mongo as-is. */
const SORTS = {
  // Highest rate first, banks grouped together so the two product types read
  // as two lists rather than one interleaved jumble.
  rate: { accountType: 1, ratePercent: -1, bank: 1 },
  bank: { bank: 1, accountType: 1, ratePercent: -1 },
  minimum: { accountType: 1, minAmount: 1, bank: 1 },
  tenure: { accountType: 1, tenureMonths: 1, bank: 1 },
};

/* ---------------------------------- reading ---------------------------------- */

/**
 * The public list. One pipeline: filter in the database, group by bank and
 * product type to find each bank's best figure, then sort the result.
 *
 * `includeInactive` is the one thing the public page never sets: the
 * administrator's list has to show a row they switched off, otherwise a
 * retired rate could never be brought back.
 */
export async function list({ accountType, bank, sort, includeInactive = false } = {}) {
  const match = includeInactive ? {} : { isActive: true };

  if (accountType) {
    if (!ACCOUNT_TYPES.includes(String(accountType))) {
      throw badRequest('Please choose savings or fixed deposit.');
    }
    match.accountType = String(accountType);
  }
  if (bank) {
    const safe = String(bank).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (safe) match.bank = { $regex: safe, $options: 'i' };
  }

  const rows = await BankRate.aggregate([
    { $match: match },
    {
      // The "best rate" marker, computed here rather than in JavaScript: a
      // $max inside a $group is the cheapest correct way to say "the highest
      // figure this bank publishes for this product type". Grouping by the
      // pair rather than by bank alone is deliberate — a savings rate and an
      // FD rate are not the same product and must never be ranked against
      // each other. The rows ride through the group on $$ROOT so the marker
      // lands back on the row it belongs to; the table is a curated handful of
      // banks, so that stays cheap.
      $group: {
        _id: { bank: '$bank', accountType: '$accountType' },
        bestRate: { $max: '$ratePercent' },
        offerCount: { $sum: 1 },
        rows: { $push: '$$ROOT' },
      },
    },
    { $unwind: '$rows' },
    {
      $project: {
        _id: 0,
        id: '$rows._id',
        bank: '$rows.bank',
        accountType: '$rows.accountType',
        ratePercent: '$rows.ratePercent',
        minAmount: '$rows.minAmount',
        tenureMonths: '$rows.tenureMonths',
        region: '$rows.region',
        note: '$rows.note',
        sourceNote: '$rows.sourceNote',
        isActive: '$rows.isActive',
        updatedAt: '$rows.updatedAt',
        isBest: { $eq: ['$rows.ratePercent', '$bestRate'] },
        bestRate: '$bestRate',
        offerCount: '$offerCount',
      },
    },
    // An unknown `sort` quietly falls back to the default rather than
    // answering a 400: this is a public read, not a form to get wrong.
    { $sort: SORTS[sort] || SORTS.rate },
  ]);

  return rows.map(present);
}

/**
 * Headline numbers for the strip above the table: how many offers of each kind,
 * the highest figure published for each kind, how many banks are on the list,
 * and the date the snapshot was last touched — the honest "as of" for a page
 * that is never live. One $facet, one round trip.
 */
export async function summary() {
  const [facet] = await BankRate.aggregate([
    { $match: { isActive: true } },
    {
      $facet: {
        byType: [
          {
            $group: {
              _id: '$accountType',
              count: { $sum: 1 },
              bestRate: { $max: '$ratePercent' },
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              banks: { $addToSet: '$bank' },
              asOf: { $max: '$updatedAt' },
            },
          },
        ],
      },
    },
  ]);

  const byType = new Map((facet?.byType || []).map((row) => [row._id, row]));
  const totals = facet?.totals?.[0] || {};

  return {
    savings: presentType(byType.get('savings')),
    fd: presentType(byType.get('fd')),
    total: totals.count || 0,
    banks: (totals.banks || []).length,
    asOf: totals.asOf ? new Date(totals.asOf).toISOString() : null,
  };
}

/* ---------------------------------- writing ---------------------------------- */

/** Add one published rate. `bank` comes from the authenticated administrator. */
export async function create(bank, payload) {
  const clean = validate({ bank, ...payload });
  const row = await BankRate.create(clean);
  return present(row);
}

/**
 * Edit one published rate. Only the keys present in `payload` are touched, and
 * validation runs on the merged result so a partial edit can never leave a row
 * holding a value the service would have refused on create.
 */
export async function update(id, payload) {
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const row = await BankRate.findById(id);
  if (!row) throw notFound();

  const patch = {};
  for (const key of ['accountType', 'ratePercent', 'minAmount', 'tenureMonths', 'region', 'note', 'sourceNote', 'isActive']) {
    if (payload?.[key] !== undefined) patch[key] = payload[key];
  }

  // `bank` is deliberately not in that list: renaming a bank is a new row to
  // publish, not an edit, so the figure keeps the source it was read from.
  const clean = validate({ ...present(row), ...patch }, { keepBank: true });
  Object.assign(row, clean);
  await row.save();
  return present(row);
}

/** Withdraw a rate. Reference data has no history to protect, so it goes. */
export async function remove(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const row = await BankRate.findByIdAndDelete(id);
  if (!row) throw notFound();
  return present(row);
}

/* -------------------------------- validation --------------------------------- */

/**
 * Every rule the module enforces, in plain words an administrator can act on.
 * `keepBank` is for edits, where the stored name is already trusted.
 */
function validate(input, { keepBank = false } = {}) {
  // An edit trusts the stored name; a create has to earn it.
  const bank = String(input.bank || '').trim();
  if (!keepBank) {
    if (!bank) throw badRequest('Please enter the bank name.');
    if (bank.length > 60) throw badRequest('Bank names can be at most 60 characters.');
  }

  const accountType = String(input.accountType || '').trim();
  if (!ACCOUNT_TYPES.includes(accountType)) throw badRequest('Please choose savings or fixed deposit.');

  const ratePercent = rate(input.ratePercent);
  const minAmount = minimum(input.minAmount);
  const tenureMonths = tenure(input.tenureMonths);
  const region = text(input.region, 60, 'Region names can be at most 60 characters.');
  const note = text(input.note, 200, 'The note can be at most 200 characters.');
  const sourceNote = text(input.sourceNote, 200, 'The source can be at most 200 characters.');

  const clean = { accountType, ratePercent, minAmount, tenureMonths, region, note, sourceNote };
  if (!keepBank) clean.bank = bank;
  if (input.isActive !== undefined) clean.isActive = Boolean(input.isActive);
  return clean;
}

/** 0–100 with at most two decimals. Arrives as a string from a text box. */
function rate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw badRequest('Please enter the rate.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) {
    throw badRequest('Rate must be a number between 0 and 100 with at most 2 decimals.');
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw badRequest('Rate must be a number between 0 and 100 with at most 2 decimals.');
  }
  return round2(n);
}

/** A positive amount with at most two decimals, or nothing at all. */
function minimum(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (!isPositiveAmount(raw)) {
    throw badRequest('The minimum must be a positive amount with up to 2 decimals, or left empty.');
  }
  return toDec(raw);
}

/** 1–120 whole months, or nothing at all (a savings account has no term). */
function tenure(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (!/^\d{1,3}$/.test(raw)) {
    throw badRequest('Tenure must be a whole number of months between 1 and 120, or left empty.');
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 120) {
    throw badRequest('Tenure must be a whole number of months between 1 and 120, or left empty.');
  }
  return n;
}

function text(value, max, tooLong) {
  const out = String(value ?? '').trim();
  if (out.length > max) throw badRequest(tooLong);
  return out;
}

/* --------------------------------- helpers ----------------------------------- */

/** One row in the shape the client draws: 0 is "no minimum published". */
function present(row) {
  const min = toNum(row.minAmount) || 0;
  return {
    id: row._id ? row._id.toString() : String(row.id ?? ''),
    bank: row.bank,
    accountType: row.accountType,
    ratePercent: round2(row.ratePercent),
    minAmount: min > 0 ? min : null,
    tenureMonths: row.tenureMonths ?? null,
    region: row.region || '',
    note: row.note || '',
    sourceNote: row.sourceNote || '',
    isActive: row.isActive !== false,
    isBest: row.isBest === true,
    bestRate: row.bestRate === undefined ? undefined : round2(row.bestRate),
    offerCount: row.offerCount ?? undefined,
    updatedAt: row.updatedAt ?? null,
  };
}

function presentType(row) {
  return { count: row?.count || 0, bestRate: row?.bestRate === undefined ? null : round2(row.bestRate) };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error('That rate is not in the table.');
  err.status = 404;
  return err;
}
