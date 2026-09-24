import Transaction from '../models/Transaction.js';

/**
 * Odd-entry guard (SYS-3). Runs after a transaction is saved and only ever
 * sets a badge — nothing is blocked, nothing is deleted. The person can
 * clear a false positive with "Not a duplicate".
 */

/** Same words in the same order, digits ignored: "Uber 6.00" ~ "uber 6". */
function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export async function flagTransaction(txn) {
  txn.flag = 'none';
  if (txn.isDeleted) return txn;

  if (await looksDuplicate(txn)) {
    txn.flag = 'duplicate';
  } else if (await looksLarge(txn)) {
    txn.flag = 'large';
  }
  await txn.save();
  return txn;
}

async function looksDuplicate(txn) {
  // An accidental double-tap on Save: same person, amount, category, day and
  // wording already on the books (or saved within the last two minutes).
  const sameDay = new Date(txn.date);
  const nextDay = new Date(sameDay.getTime() + 24 * 60 * 60 * 1000);

  const twin = await Transaction.findOne({
    _id: { $ne: txn._id },
    user: txn.user,
    category: txn.category,
    amount: txn.amount,
    type: txn.type,
    date: { $gte: sameDay, $lt: nextDay },
    $or: [
      { description: txn.description },
      { createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) } },
    ],
  });
  return Boolean(twin);
}

async function looksLarge(txn) {
  // Two simple tests, both need a reasonable sample so week-one users
  // aren't flagged for buying a textbook:
  //   1. clearly above this category's typical size (median x 3),
  //   2. or far from the average (mean + 3 standard deviations).
  const samples = await Transaction.find({
    user: txn.user,
    category: txn.category,
    isDeleted: false,
    _id: { $ne: txn._id },
  })
    .select('amount')
    .limit(200)
    .lean();

  if (samples.length < 5) return false;

  const amounts = samples.map((s) => Number(s.amount.$numberDecimal ?? s.amount)).sort((a, b) => a - b);
  const amount = Number(txn.amount.$numberDecimal ?? txn.amount);

  const median = amounts.length % 2
    ? amounts[(amounts.length - 1) / 2]
    : (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2;
  if (amount > median * 3) return true;

  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((acc, v) => acc + (v - mean) ** 2, 0) / amounts.length;
  const sigma = Math.sqrt(variance);
  return sigma > 0 && amount > mean + 3 * sigma;
}

/** The "Not a duplicate" action from the UI. */
export async function clearFlag(user, txnId) {
  const txn = await Transaction.findOne({ _id: txnId, user: user._id, isDeleted: false });
  if (!txn) return null;
  txn.flag = 'none';
  await txn.save();
  return txn;
}
