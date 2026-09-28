import mongoose from 'mongoose';

import Wallet from '../models/Wallet.js';
import WalletTransfer from '../models/WalletTransfer.js';
import Transaction from '../models/Transaction.js';
import { toDec, isPositiveAmount, round2 } from '../utils/money.js';
import { startOfDay, monthWindow } from '../utils/dates.js';

/**
 * Wallets, and the balances they add up to (NEW-11).
 *
 * THE ONE RULE
 *
 * A transfer is not a transaction. It never reaches `transactions`, so it cannot
 * appear in an income figure, an expense figure, a budget, a chart, a report or
 * the month total - not because a filter remembers to skip it, but because it was
 * never in the collection those are read from. That is the whole reason this
 * module exists rather than a pair of ledger entries.
 *
 * A BALANCE IS DERIVED, NEVER STORED
 *
 *   balance = opening
 *           + income filed to this wallet
 *           - expenses filed to this wallet
 *           - transfers OUT of this wallet
 *           + transfers IN to this wallet
 *
 * Four numbers, all from the database, and nothing to fall out of step. A stored
 * balance is a number that can be wrong and cannot prove it is right; this one is
 * recomputed on every read, so a wrong figure is not possible.
 *
 * MONEY IS WHOLE CENTS
 *
 * Every sum here runs through `toNum`/Decimal128 and the arithmetic is in cents,
 * for the same reason the rest of the app does it: 0.1 + 0.2 is not 0.3, and a
 * wallet that is a cent out on every read looks broken even when it is right.
 *
 * SEEDING
 *
 * A new account gets three wallets on its first visit here - cash, a bank
 * account, a mobile wallet - because those are the three pockets a student
 * actually has, and an empty picker teaches nothing. It is idempotent, and it
 * never overwrites a name or a balance the reader has already set.
 */

const MAX_WALLETS = 12;
const MAX_NAME = 40;

/* The three a student starts with. Names are the app's own wording and are
   translated in the UI, but a NAME is stored per person rather than looked up,
   because "Easypaisa" is their name for their wallet and not ours. */
const STARTER_WALLETS = [
  { name: 'Cash', kind: 'cash', icon: 'coins', tone: 's1', isDefault: true },
  { name: 'Bank account', kind: 'bank', icon: 'bank', tone: 's3' },
  { name: 'Mobile wallet', kind: 'mobile', icon: 'phone', tone: 's4' },
];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

/* ------------------------------- the seeding ------------------------------- */

/**
 * Make sure this person has at least one wallet, and exactly one default.
 *
 * Called from the wallets route on every read (the same self-healing sweep the
 * groups list does for an invited membership) and from registration. `null` return
 * means "nothing was created", which is the common case and the cheap one.
 */
export async function ensureWallets(user) {
  if (!user?._id) return { created: 0 };

  const mine = await Wallet.find({ user: user._id, isActive: true }).sort({ createdAt: 1 });
  if (mine.length > 0) {
    // A default may be missing if two were archived at once; repair it quietly.
    if (!mine.some((w) => w.isDefault)) {
      mine[0].isDefault = true;
      await mine[0].save();
    }
    return { created: 0 };
  }

  const created = [];
  for (const starter of STARTER_WALLETS) {
    created.push(
      await Wallet.create({
        user: user._id,
        name: starter.name,
        kind: starter.kind,
        icon: starter.icon,
        tone: starter.tone,
        isDefault: Boolean(starter.isDefault),
      })
    );
  }
  return { created: created.length };
}

/* --------------------------------- reading --------------------------------- */

/**
 * Every active wallet with its CURRENT balance, in the reader's own order.
 *
 * The balance comes from four aggregates rather than one clever one: MongoDB
 * cannot subtract two different collections in a single pipeline without a
 * $lookup that has to be written and then understood, and the arithmetic that
 * decides what a student sees should be four lines of obvious code.
 */
export async function listWallets(user, { includeArchived = false } = {}) {
  const find = { user: user._id };
  if (!includeArchived) find.isActive = true;

  const wallets = await Wallet.find(find).sort({ isDefault: -1, createdAt: 1 });
  if (wallets.length === 0) return [];

  const ids = wallets.map((w) => w._id);
  const map = new Map(wallets.map((w) => [w._id.toString(), w]));

  const money = await walletMoney(user._id, ids, { month: null });

  return wallets.map((w) => {
    const row = money.get(w._id.toString()) || { income: 0, expense: 0, out: 0, in: 0 };
    return w.toPublic(asUnits(balanceOf(w.openingBalance, row)));
  });
}

/**
 * One wallet with the figure it now holds, for a write that has just changed it.
 *
 * A balance is derived from four sums and is never stored, so a freshly written
 * document carries none. Answering a create with a null balance would read as an
 * empty wallet, and the person who just added one would add it again.
 */
export async function withBalance(user, wallet) {
  if (!wallet) return null;
  const money = await walletMoney(user._id, [wallet._id], { month: null });
  const row = money.get(wallet._id.toString()) || { income: 0, expense: 0, out: 0, in: 0 };
  return wallet.toPublic(asUnits(balanceOf(wallet.openingBalance, row)));
}

/** The wallet new entries are filed to when nobody picks one. */
export async function defaultWallet(user) {
  await ensureWallets(user);
  return Wallet.findOne({ user: user._id, isActive: true }).sort({ isDefault: -1, createdAt: 1 });
}

/**
 * Is this wallet the reader's own? A stranger's wallet is a 404 here, never a 403:
 * the app does not confirm that an id exists for anybody else.
 */
export async function ownWallet(user, walletId, { required = true } = {}) {
  if (!mongoose.isValidObjectId(walletId)) {
    if (required) throw notFound('That wallet does not exist.');
    return null;
  }
  const wallet = await Wallet.findOne({ _id: walletId, user: user._id });
  if (!wallet && required) throw notFound('That wallet does not exist.');
  return wallet;
}

/* --------------------------------- writing --------------------------------- */

export async function createWallet(user, { name, kind, hint, openingBalance, icon, tone } = {}) {
  const clean = String(name || '').trim();
  if (!clean) throw badRequest('Give the wallet a name so you can tell it from the others.');
  if (clean.length > MAX_NAME) throw badRequest(`A wallet name is at most ${MAX_NAME} characters.`);
  if (!['cash', 'bank', 'mobile'].includes(String(kind || 'cash'))) {
    throw badRequest('A wallet is cash, a bank account, or a mobile wallet.');
  }

  // A hint is a nickname, not an account number: four digits, and nothing else.
  const digits = String(hint || '').replace(/\D/g, '').slice(0, 4);
  if (hint && !digits) throw badRequest('Use the last four digits, or leave it empty.');

  const mine = await Wallet.countDocuments({ user: user._id, isActive: true });
  if (mine >= MAX_WALLETS) throw badRequest(`You can keep up to ${MAX_WALLETS} wallets.`);

  const duplicate = await Wallet.findOne({ user: user._id, name: clean, isActive: true });
  if (duplicate) throw badRequest('You already have a wallet with that name.');

  let opening = null;
  if (openingBalance !== undefined && openingBalance !== null && String(openingBalance) !== '') {
    if (!isPositiveAmount(openingBalance) && Number(openingBalance) !== 0) {
      throw badRequest('The opening balance has to be zero or more, with at most two decimals.');
    }
    opening = toDec(openingBalance);
  }

  const wallet = await Wallet.create({
    user: user._id,
    name: clean,
    kind,
    hint: digits,
    openingBalance: opening,
    icon: icon || defaultIconFor(kind),
    tone: tone || defaultToneFor(kind),
  });

  // The first wallet a person adds by hand becomes their default, because a new
  // entry with no wallet picked has to go somewhere sensible.
  const anyDefault = await Wallet.findOne({ user: user._id, isDefault: true, _id: { $ne: wallet._id } });
  if (!anyDefault) {
    wallet.isDefault = true;
    await wallet.save();
  }

  return wallet;
}

export async function updateWallet(user, walletId, patch = {}) {
  const wallet = await ownWallet(user, walletId);

  if (patch.name !== undefined) {
    const clean = String(patch.name).trim();
    if (!clean) throw badRequest('A wallet needs a name.');
    if (clean.length > MAX_NAME) throw badRequest(`A wallet name is at most ${MAX_NAME} characters.`);
    const duplicate = await Wallet.findOne({
      user: user._id,
      name: clean,
      isActive: true,
      _id: { $ne: wallet._id },
    });
    if (duplicate) throw badRequest('You already have a wallet with that name.');
    wallet.name = clean;
  }

  if (patch.kind !== undefined) {
    if (!['cash', 'bank', 'mobile'].includes(patch.kind)) {
      throw badRequest('A wallet is cash, a bank account, or a mobile wallet.');
    }
    wallet.kind = patch.kind;
  }

  if (patch.hint !== undefined) {
    const digits = String(patch.hint || '').replace(/\D/g, '').slice(0, 4);
    if (patch.hint && !digits) throw badRequest('Use the last four digits, or leave it empty.');
    wallet.hint = digits;
  }

  if (patch.openingBalance !== undefined) {
    if (patch.openingBalance === null || String(patch.openingBalance) === '') {
      wallet.openingBalance = null;
    } else {
      if (!isPositiveAmount(patch.openingBalance) && Number(patch.openingBalance) !== 0) {
        throw badRequest('The opening balance has to be zero or more, with at most two decimals.');
      }
      wallet.openingBalance = toDec(patch.openingBalance);
    }
  }

  if (patch.icon !== undefined) wallet.icon = String(patch.icon).slice(0, 16);
  if (patch.tone !== undefined) wallet.tone = String(patch.tone).slice(0, 8);

  if (patch.isDefault === true) await makeDefault(user, wallet);
  if (patch.isDefault === false && wallet.isDefault) {
    throw badRequest('One wallet has to be the default, so another one cannot stop being it.');
  }

  await wallet.save();
  return wallet;
}

/** Exactly one default: making one the default takes it from whoever had it. */
async function makeDefault(user, wallet) {
  const previous = await Wallet.find({ user: user._id, isDefault: true, _id: { $ne: wallet._id } });
  for (const row of previous) {
    row.isDefault = false;
    await row.save();
  }
  wallet.isDefault = true;
}

/**
 * Archive, never delete. A wallet's transactions still point at it and its
 * transfers still name it; a 404 on the reader's own history would be a lie.
 * The default wallet cannot be archived while another one exists, because then
 * new entries would have nowhere to go.
 */
export async function archiveWallet(user, walletId) {
  const wallet = await ownWallet(user, walletId);
  if (!wallet.isActive) return wallet;

  if (wallet.isDefault) {
    const other = await Wallet.findOne({ user: user._id, isActive: true, _id: { $ne: wallet._id } });
    if (other) throw badRequest('This is where new entries go. Make another wallet the default first.');
  }

  wallet.isActive = false;
  await wallet.save();
  return wallet;
}

/* -------------------------------- the transfer ------------------------------ */

/**
 * Move money between two of this person's own wallets.
 *
 * A double entry, written once: one document with both ends, because the two ends
 * happen at the same instant and a pair of documents could disagree. The balance
 * of each wallet moves by the same amount in opposite directions, which is the
 * whole definition of a double entry and the reason a transfer cannot be
 * represented as one expense and one income.
 *
 * It refuses, by name, and writes nothing when:
 *  - the two wallets are the same (a transfer with one end is a note);
 *  - either wallet is not the reader's (404, never 403);
 *  - the amount is not money;
 *  - the date is not a day.
 */
export async function recordTransfer(user, { fromId, toId, amount, date, note } = {}) {
  const amountValue = String(amount ?? '').trim();
  if (!isPositiveAmount(amountValue)) {
    throw badRequest('How much are you moving? It has to be more than zero, with at most two decimals.');
  }

  const cents = centsOf(amountValue);
  if (cents <= 0) throw badRequest('How much are you moving? It has to be more than zero.');

  const from = await ownWallet(user, fromId);
  const to = await ownWallet(user, toId);
  if (from._id.toString() === to._id.toString()) {
    throw badRequest('That is the same wallet on both sides. Pick where the money is going.');
  }
  if (!from.isActive || !to.isActive) {
    throw badRequest('One of those wallets is closed. Open it before moving money through it.');
  }

  // cents with cents: this check is arithmetic, and the sentence below it is prose
  const balance = await balanceOfOne(user._id, from._id);
  if (balance < cents) {
    throw badRequest(
      `That wallet holds ${asUnits(balance).toFixed(2)} and you are moving ${asUnits(cents).toFixed(2)}.`
    );
  }

  const transfer = await WalletTransfer.create({
    user: user._id,
    from: from._id,
    to: to._id,
    amount: toDec(amountValue),
    date: startOfDay(date || new Date()),
    note: String(note || '').trim().slice(0, 120),
  });

  const wallets = await walletNameMap(user._id);
  return transfer.toPublic(wallets);
}

/**
 * This wallet's movements, newest first, with both ends named. Read from the
 * transfers collection only, because this is the wallet's own story and an
 * expense that happened to be filed to it belongs on the transactions page.
 */
export async function transferHistory(user, { walletId = null, limit = 25 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 25, 1), 100);

  const find = { user: user._id };
  if (walletId) {
    const wallet = await ownWallet(user, walletId);
    find.$or = [{ from: wallet._id }, { to: wallet._id }];
  }

  const rows = await WalletTransfer.find(find).sort({ date: -1, createdAt: -1 }).limit(cap);
  const wallets = await walletNameMap(user._id);
  return rows.map((row) => ({ ...row.toPublic(wallets), direction: walletId ? directionOf(row, walletId) : null }));
}

function directionOf(row, walletId) {
  const id = String(walletId);
  if (row.from.toString() === id) return 'out';
  if (row.to.toString() === id) return 'in';
  return null;
}

async function walletNameMap(userId) {
  const rows = await Wallet.find({ user: userId }).select('name kind');
  return new Map(rows.map((w) => [w._id.toString(), { name: w.name, kind: w.kind }]));
}

/* -------------------------------- the balances ------------------------------ */

/**
 * The four sums, for a set of wallets, in one pass each.
 *
 * `month` narrows the income and the expenses to a calendar month, which is what
 * the wallet card on the dashboard wants ("this month" per wallet). `null` means
 * everything ever, which is what the wallet's own balance wants.
 */
async function walletMoney(userId, walletIds, { month = null } = {}) {
  const out = new Map();
  const seed = () => ({ income: 0, expense: 0, out: 0, in: 0 });
  for (const id of walletIds) out.set(id.toString(), seed());

  const window = month ? monthWindow(month) : null;

  /* income and expenses filed to a wallet */
  const flows = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        isDeleted: false,
        type: { $in: ['income', 'expense'] },
        ...(window ? { date: window } : {}),
      },
    },
    { $group: { _id: { wallet: '$wallet', type: '$type' }, total: { $sum: '$amount' } } },
  ]);
  for (const row of flows) {
    const id = row._id.wallet ? row._id.wallet.toString() : null;
    if (!id || !out.has(id)) continue;
    const cell = out.get(id);
    const value = centsOf(row.total);
    if (row._id.type === 'income') cell.income += value;
    else cell.expense += value;
  }

  /* transfers: out of one wallet and into another, never both */
  const moves = await WalletTransfer.aggregate([
    { $match: { user: userId, ...(window ? { date: window } : {}) } },
    {
      $group: {
        _id: { from: '$from', to: '$to' },
        total: { $sum: '$amount' },
      },
    },
  ]);
  for (const row of moves) {
    const from = row._id.from?.toString();
    const to = row._id.to?.toString();
    const value = centsOf(row.total);
    if (from && out.has(from)) out.get(from).out += value;
    if (to && out.has(to)) out.get(to).in += value;
  }

  return out;
}

/** The four sums turned into one figure, in whole cents. */
function balanceOf(opening, row) {
  const start = opening == null ? 0 : centsOf(opening);
  return start + row.income - row.expense - row.out + row.in;
}

/**
 * Cents out of the arithmetic, units out of the answer.
 *
 * This is the ONLY place the two units meet. The arithmetic above is in cents so
 * that four sums can be added without a float creeping in; everything a person
 * reads is in units, so a wallet holding 3,000 says 3,000 and not 300,000.
 */
function asUnits(cents) {
  return round2(cents / 100);
}

async function balanceOfOne(userId, walletId) {
  const money = await walletMoney(userId, [walletId], { month: null });
  const wallet = await Wallet.findById(walletId).select('openingBalance').lean();
  return balanceOf(wallet?.openingBalance, money.get(walletId.toString()) || { income: 0, expense: 0, out: 0, in: 0 });
}

/**
 * Every wallet's balance for a month, for the dashboard's wallet row. The total
 * is deliberately NOT the sum of the wallets: the total is the app's own balance
 * (income minus expense), and the two are equal only when every entry has been
 * filed to a wallet. The screen says so rather than showing a number that
 * disagrees with the balance card above it.
 */
export async function walletBalances(user, { month = null } = {}) {
  const wallets = await Wallet.find({ user: user._id, isActive: true }).sort({
    isDefault: -1,
    createdAt: 1,
  });
  if (wallets.length === 0) return { wallets: [], unfiled: 0 };

  const money = await walletMoney(user._id, wallets.map((w) => w._id), { month });
  return {
    wallets: wallets.map((w) => {
      const row = money.get(w._id.toString()) || { income: 0, expense: 0, out: 0, in: 0 };
      return {
        ...w.toPublic(asUnits(balanceOf(w.openingBalance, row))),
        monthIncome: asUnits(row.income),
        monthExpense: asUnits(row.expense),
      };
    }),
    // entries with no wallet on them: the honest answer when a reader has had
    // transactions since before this existed
    unfiled: await countUnfiled(user._id, month),
  };
}

async function countUnfiled(userId, month) {
  const window = month ? monthWindow(month) : null;
  // "No pocket" is two shapes in the database, and only counting one of them
  // is how a screen ends up telling somebody that everything is filed while an
  // entry sits there with none: the field is declared with `default: null`, so
  // every row written since has `wallet: null`, and every row written BEFORE the
  // field existed has no `wallet` key at all. Both mean the same thing to a
  // reader, so both are asked for.
  return Transaction.countDocuments({
    user: userId,
    isDeleted: false,
    wallet: { $in: [null, undefined] },
    ...(window ? { date: window } : {}),
  });
}

/* --------------------------------- helpers --------------------------------- */

/** Whole cents, from the digits of a number. Never a float sum. */
function centsOf(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const negative = text.startsWith('-');
  const digits = text.replace(/[^0-9.]/g, '');
  const [whole = '0', frac = ''] = digits.split('.');
  const cents = Number(whole || 0) * 100 + Number((frac + '00').slice(0, 2) || 0);
  return negative ? -cents : cents;
}

function defaultIconFor(kind) {
  if (kind === 'bank') return 'bank';
  if (kind === 'mobile') return 'phone';
  return 'coins';
}

function defaultToneFor(kind) {
  if (kind === 'bank') return 's3';
  if (kind === 'mobile') return 's4';
  return 's1';
}
