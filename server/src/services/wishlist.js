import mongoose from 'mongoose';
import WishItem from '../models/WishItem.js';
import JarMovement from '../models/JarMovement.js';
import User from '../models/User.js';
import { toDec, toNum, round2, isPositiveAmount } from '../utils/money.js';

/**
 * The secret wishlist and the micro-savings jar (WISH-1 / WISH-2).
 *
 * The jar is a pot INSIDE the app, not a ledger account: a deposit is the
 * student deciding not to spend, so it must never look like spending. Nothing
 * here writes a Transaction — the only place the money lives is
 * `User.jarBalance`, and the only record of how it got there is JarMovement.
 *
 * Rules this module guarantees:
 *  - every query is scoped to the owner, and somebody else's row answers 404
 *    (never 403, never a name that confirms it exists);
 *  - money is Decimal128 end to end: cents are added and subtracted in the
 *    database with $inc, and plain numbers appear only at the JSON edge via
 *    money.js — no float arithmetic ever touches a stored amount;
 *  - the jar can never go negative, and a wish can never be pushed below the
 *    zero it was saved at;
 *  - `status` is decided here, by the arithmetic — a client can pause or
 *    resume a wish, but it cannot declare one achieved.
 */

/** A ceiling so a fat-fingered 10^12 cannot sit in someone's jar forever. */
const MAX_AMOUNT = 1e9;

const ZERO = mongoose.Types.Decimal128.fromString('0.00');

/* ---------------------------------- reading ---------------------------------- */

/** The whole screen in one call: wishes with their progress, plus the jar. */
export async function list(user) {
  const [rows, summary] = await Promise.all([WishItem.find({ user: user._id }).sort({ createdAt: -1 }), summarise(user._id)]);

  return {
    rows: rows.map(presentItem),
    jarBalance: toNum(user.jarBalance) || 0,
    summary,
  };
}

/**
 * Totals for the page header, summed in the database and grouped by the owner
 * (one group per person) rather than added up row by row in JavaScript.
 */
export async function summarise(userId) {
  const [row] = await WishItem.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$user',
        totalTarget: { $sum: '$targetAmount' },
        totalSaved: { $sum: '$savedAmount' },
        count: { $sum: 1 },
        countAchieved: { $sum: { $cond: [{ $eq: ['$status', 'achieved'] }, 1, 0] } },
      },
    },
  ]);

  return {
    totalTarget: toNum(row?.totalTarget ?? 0) || 0,
    totalSaved: toNum(row?.totalSaved ?? 0) || 0,
    count: row?.count ?? 0,
    countAchieved: row?.countAchieved ?? 0,
  };
}

/** Recent jar movements, newest first, with the wish title when there is one. */
export async function history(user, { limit } = {}) {
  const max = Math.min(100, Math.max(1, Number(limit) || 8));
  const rows = await JarMovement.find({ user: user._id })
    .sort({ date: -1, createdAt: -1 })
    .limit(max)
    .populate('wishItem', 'title icon');

  return rows.map((m) => ({
    id: m._id.toString(),
    kind: m.kind,
    amount: toNum(m.amount),
    wishItemId: m.wishItem?._id ? m.wishItem._id.toString() : null,
    wishTitle: m.wishItem?.title || '',
    icon: m.wishItem?.icon || '',
    note: m.note,
    date: m.date,
  }));
}

/* ---------------------------------- writing ---------------------------------- */

export async function create(user, { title, targetAmount, note, icon, targetDate } = {}) {
  const name = String(title ?? '').trim();
  if (!name) throw badRequest('Give your wish a name.');

  return WishItem.create({
    user: user._id,
    title: name.slice(0, 80),
    note: String(note ?? '').trim().slice(0, 200),
    targetAmount: checkAmount(targetAmount, 'The target must be more than 0, with at most 2 decimals.'),
    icon: pickIcon(icon),
    targetDate: optionalDate(targetDate, 'target date'),
  });
}

/**
 * Edit a wish. Lowering the target is allowed, but never below what is already
 * saved — that would quietly make a wish look reached when it is not, so the
 * student is asked to take money out first.
 */
export async function update(user, id, patch = {}) {
  const item = await ownItem(user, id);

  if (patch.title !== undefined) {
    const name = String(patch.title ?? '').trim();
    if (!name) throw badRequest('Give your wish a name.');
    item.title = name.slice(0, 80);
  }
  if (patch.note !== undefined) item.note = String(patch.note ?? '').trim().slice(0, 200);
  if (patch.icon !== undefined) item.icon = pickIcon(patch.icon);
  if (patch.targetDate !== undefined) item.targetDate = optionalDate(patch.targetDate, 'target date');

  if (patch.targetAmount !== undefined && patch.targetAmount !== null && patch.targetAmount !== '') {
    const target = checkAmount(patch.targetAmount, 'The target must be more than 0, with at most 2 decimals.');
    if (toNum(target) < toNum(item.savedAmount)) {
      throw badRequest('That target is below what you have already saved. Take some out first, or set a higher target.');
    }
    item.targetAmount = target;
  }

  if (patch.status !== undefined) {
    // "achieved" is earned by reaching the target, never typed in — otherwise
    // the badge and the progress bar could tell two different stories.
    if (!['saving', 'paused'].includes(patch.status)) {
      throw badRequest('A wish becomes achieved on its own once the saved amount reaches the target.');
    }
    item.status = patch.status;
  }

  await item.save();
  return settle(item);
}

/**
 * Remove a wish. Whatever was saved for it is NOT thrown away: it stays in the
 * jar, which is the whole point of keeping the two apart.
 */
export async function remove(user, id) {
  const item = await ownItem(user, id);
  await item.deleteOne();
  return item;
}

/** Move money INTO the jar, optionally towards one wish (WISH-2). */
export async function deposit(user, { amount, wishItemId, note, date } = {}) {
  const value = checkAmount(amount, 'The amount must be more than 0, with at most 2 decimals.');
  const item = wishItemId ? await ownItem(user, wishItemId) : null;

  // $inc so two quick taps can never lose a cent to a read-then-write.
  const holder = await User.findOneAndUpdate({ _id: user._id }, { $inc: { jarBalance: value } }, { new: true });

  let wish = null;
  if (item) {
    const fresh = await WishItem.findOneAndUpdate(
      { _id: item._id, user: user._id },
      { $inc: { savedAmount: value } },
      { new: true }
    );
    wish = await settle(fresh);
  }

  const movement = await JarMovement.create({
    user: user._id,
    kind: 'deposit',
    amount: value,
    wishItem: item ? item._id : null,
    note: String(note ?? '').trim().slice(0, 140),
    date: optionalDate(date, 'date') || new Date(),
  });

  return { jarBalance: toNum(holder.jarBalance) || 0, wish, movement };
}

/** Take money back OUT of the jar — the student changed their mind. */
export async function withdraw(user, { amount, wishItemId, note, date } = {}) {
  const value = checkAmount(amount, 'The amount must be more than 0, with at most 2 decimals.');
  const item = wishItemId ? await ownItem(user, wishItemId) : null;
  const out = opposite(value);

  // The guard lives inside the query, so the jar can only ever give up what it
  // actually holds: two withdrawals racing for the same last coin cannot both
  // win, and the balance can never dip below zero.
  const holder = await User.findOneAndUpdate(
    { _id: user._id, jarBalance: { $gte: value } },
    { $inc: { jarBalance: out } },
    { new: true }
  );
  if (!holder) throw badRequest('The jar does not hold that much yet. Save a little more first.');

  let wish = null;
  if (item) {
    const fresh = await WishItem.findOneAndUpdate(
      { _id: item._id, user: user._id },
      { $inc: { savedAmount: out } },
      { new: true }
    );
    // The pot is shared with plain deposits, so an item can be asked for less
    // than it holds — it stops at zero rather than going negative.
    if (toNum(fresh.savedAmount) < 0) {
      await WishItem.updateOne({ _id: item._id, savedAmount: { $lt: 0 } }, { $set: { savedAmount: ZERO } });
      fresh.savedAmount = ZERO;
    }
    wish = await settle(fresh);
  }

  const movement = await JarMovement.create({
    user: user._id,
    kind: 'withdraw',
    amount: value,
    wishItem: item ? item._id : null,
    note: String(note ?? '').trim().slice(0, 140),
    date: optionalDate(date, 'date') || new Date(),
  });

  return { jarBalance: toNum(holder.jarBalance) || 0, wish, movement };
}

/* ---------------------------------- helpers ---------------------------------- */

/** The shape every screen paints from: money as plain numbers, progress ready. */
export function presentItem(item) {
  const target = toNum(item.targetAmount) || 0;
  const saved = toNum(item.savedAmount) || 0;
  const progress = target > 0 ? Math.min(1, saved / target) : 0;

  return {
    id: item._id.toString(),
    title: item.title,
    note: item.note,
    icon: item.icon,
    status: item.status,
    targetAmount: target,
    savedAmount: saved,
    progress: Number(progress.toFixed(4)), // 0..1, a ratio rather than an amount
    pct: Math.round(progress * 100),
    remaining: round2(Math.max(0, target - saved)),
    targetDate: item.targetDate,
    achievedAt: item.achievedAt,
    createdAt: item.createdAt,
  };
}

/**
 * Keeps `status` in step with the arithmetic: reaching the target marks the
 * wish achieved and stamps the day, dropping back below it un-achieves it.
 * A paused wish is left alone — pausing is a deliberate "not right now".
 */
async function settle(item) {
  const reached = toNum(item.savedAmount) >= toNum(item.targetAmount);
  if (reached && item.status !== 'achieved' && item.status !== 'paused') {
    item.status = 'achieved';
    if (!item.achievedAt) item.achievedAt = new Date();
    await item.save();
  } else if (!reached && item.status === 'achieved') {
    item.status = 'saving';
    item.achievedAt = null;
    await item.save();
  }
  return item;
}

/** Somebody else's row is a 404 — the same answer as a row that never existed. */
async function ownItem(user, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const item = await WishItem.findOne({ _id: id, user: user._id });
  if (!item) throw notFound();
  return item;
}

/** One positive amount, at most two decimals, inside the ceiling. */
function checkAmount(value, message) {
  if (!isPositiveAmount(value)) throw badRequest(message);
  if (Number(value) > MAX_AMOUNT) throw badRequest('That amount is too large — the limit is 1,000,000,000.');
  return toDec(value);
}

/** -1 × a Decimal128, still in base ten. */
function opposite(dec) {
  const raw = dec.$numberDecimal ?? String(dec);
  return mongoose.Types.Decimal128.fromString(raw.startsWith('-') ? raw.slice(1) : `-${raw}`);
}

/** The chosen emoji, or the default gift. Counted in code points so a long
 *  string can never cut an emoji in half. */
function pickIcon(value) {
  const glyph = String(value ?? '').trim();
  return glyph ? Array.from(glyph).slice(0, 8).join('') : '🎁';
}

/** A soft "by when": absent stays absent, nonsense is a 400, no past-date policing. */
function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const day = new Date(value);
  if (Number.isNaN(day.getTime())) throw badRequest(`Please pick a valid ${label}.`);
  return day;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error('Wish not found.');
  err.status = 404;
  return err;
}
