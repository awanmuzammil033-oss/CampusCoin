import mongoose from 'mongoose';

import GroupAccount from '../models/GroupAccount.js';
import GroupJournalEntry from '../models/GroupJournalEntry.js';
import GroupReconcile from '../models/GroupReconcile.js';
import GroupExpense from '../models/GroupExpense.js';
import GroupSettlement from '../models/GroupSettlement.js';
import { loadGroupFor, requireCapability } from './groups.js';
import { toDec, toNum, formatMoney } from '../utils/money.js';

/**
 * A group's own books (GRP-3, GRP-5, GRP-7): the chart of accounts, the general
 * journal, the trial balance, and a bank reconciliation.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ------------------------------------
 * An entry is stored only if its debits equal its credits, in whole cents.
 * Nothing is written first and checked afterwards: the lines are read, turned
 * into integer cents, added up here, and the entry is created only once the two
 * columns are the same number. There is no flag on the model, no admin
 * override, and no "post it and fix it later" — a book that can hold an
 * unbalanced entry is a book nobody can add up.
 *
 * A POSTED ENTRY IS IMMUTABLE. No update, no delete, no exception. The single
 * correction on offer is the mirrored entry (`reverseEntry`): every debit
 * becomes a credit of the same amount and the other way round, dated the same
 * day unless the treasurer says otherwise, memo'd with the reference it undoes.
 * The original row is not touched, so the journal shows the mistake AND the
 * correction side by side, and a reader can see that something was changed
 * because it was. Editing in place would leave exactly the same total with no
 * sign that anybody had been wrong. The only thing that may be attached to a
 * posted entry afterwards is a flag, and a flag is a question, not an edit (the
 * rule GroupExpense.flag already follows).
 *
 * Three more rules, none of them features:
 *
 *  1. ISOLATION. Every entry point starts at the person, through the same
 *     `loadGroupFor` the rest of the group module uses, so a group that is not
 *     the caller's is a 404 and never a 403 — a 403 would confirm the group
 *     exists. The router does not know or care who is a member.
 *
 *  2. MONEY IS WHOLE CENTS. `centsOf` parses the digits of the number itself
 *     rather than multiplying a float, and every total, balance, match and
 *     comparison below is integer arithmetic on those cents. 33.33 x 3 is
 *     99.99 here because it is 3333 + 3333 + 3333 cents, not because a float
 *     happened to come out right. A float appears exactly once, at the JSON
 *     edge, and only to be rounded back to two decimals.
 *
 *  3. A PAYLOAD CANNOT REACH ANOTHER GROUP'S LEDGER. An account is named in a
 *     journal line by its CODE, and the code is resolved against the calling
 *     group's own chart (`ensureChart` → the accounts of this group, and only
 *     those). A code that is not in this group is a 400 that says so, whatever
 *     group happens to have that code in its books.
 *
 * The chart is seeded on first use, not at group creation, so a group that was
 * made before this feature started working the first time somebody opens the
 * journal — and the seed is safe against two people opening it at once.
 */

const CHART = Object.freeze([
  { code: '1000', name: 'Cash in hand', type: 'asset' },
  { code: '1010', name: 'Bank account', type: 'asset' },
  { code: '1100', name: 'Receivable from members', type: 'asset' },
  { code: '2000', name: 'Payable to members', type: 'liability' },
  { code: '3000', name: 'Group fund', type: 'equity' },
  { code: '4000', name: 'Income', type: 'income' },
  { code: '5000', name: 'Food & drinks', type: 'expense' },
  { code: '5010', name: 'Transport', type: 'expense' },
  { code: '5020', name: 'Rent & bills', type: 'expense' },
  { code: '5030', name: 'Utilities', type: 'expense' },
  { code: '5040', name: 'Supplies', type: 'expense' },
  { code: '5090', name: 'Other expenses', type: 'expense' },
]);

/** The types whose balance reads on the debit side when it is positive. */
const NATURAL_DEBIT = new Set(['asset', 'expense']);

const MIN_LINES = 2;
const MAX_LINES = 20;
const MAX_MEMO = 200;
const DEFAULT_PAGE = 25;
const MAX_PAGE = 100;
const MAX_STATEMENT_LINES = 200;
/**
 * How far a bank statement line and a book line may be apart and still be "the
 * same money". A bank dates a payment the day it is sent and the other side
 * dates it the day it clears, so the two are never on the same day.
 */
const MATCH_DAYS = 5;
const MONEY_IN_DEFAULT = '4000';
const MONEY_OUT_DEFAULT = '5090';
/** Enough to name a handful of lines in a refusal without a wall of text. */
const NAMED_IN_A_SENTENCE = 6;

/* ---------------------------------- reads ---------------------------------- */

/**
 * The general journal: the chart (so the page can offer the codes to post
 * against) and a page of entries, newest first.
 *
 * `before` is either a calendar day or the id of an entry, and the cursor that
 * comes back is an entry id — paging by a day would bring back the whole day
 * twice, because two entries posted on the same day share a date.
 */
export async function journal(user, groupId, { limit, before } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'view');
  const accounts = await ensureChart(group);

  const take = pageSize(limit);
  const page = await GroupJournalEntry.find({ group: group._id, ...(await beforePage(group, before)) })
    .sort({ date: -1, _id: -1 })
    .limit(take + 1);
  const more = page.length > take;
  const entries = page.slice(0, take);
  await Promise.all(entries.map((entry) => entry.populate('lines.account', 'code name type')));

  return {
    group: publicGroup(group),
    accounts: accounts.map(publicAccount),
    rows: entries.map((entry) => toPublicEntry(entry, group, group.memberIndexOf(user._id))),
    nextCursor: more ? entries.at(-1)._id.toString() : null,
  };
}

/**
 * The trial balance (GRP-5): every account, its debits, its credits and its
 * balance, and the proof that the two columns are equal.
 *
 * `balanced` is reported, not assumed. The entries are validated on the way in,
 * so the two columns are equal — but a trial balance that cannot say "these do
 * not add up" is a decoration, not a check. If the books are ever out (a row
 * written straight to the collection, a restore from a bad backup, a bug in
 * another service), this returns both totals and `balanced: false`, and the
 * page says so loudly rather than showing a tidy lie.
 *
 * The context figures are the split board — the bills and settlements the group
 * already had. They are a DIFFERENT question ("who owes whom for the mess bill")
 * from the ledger's ("what is in the bank and where did it go"), and they are
 * deliberately not posted into the ledger automatically: a bill says a share
 * was incurred, the journal says which accounts moved. Copying one into the
 * other would make the two disagree the first time anybody looked closely, so
 * the trial balance carries the split board beside it for comparison only.
 */
export async function trialBalance(user, groupId) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'view');
  const accounts = await ensureChart(group);

  // The movement per account, summed by the database over the unwound lines —
  // one pipeline for the whole group rather than a read per account.
  const movement = await GroupJournalEntry.aggregate([
    { $match: { group: group._id } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.account',
        debits: { $sum: '$lines.debit' },
        credits: { $sum: '$lines.credit' },
      },
    },
  ]);
  const moved = new Map(movement.map((row) => [String(row._id), row]));

  // An account with no movement is STILL LISTED, with zeros: a trial balance
  // that hides the accounts a group has not used yet is not a trial balance, it
  // is a summary of the entries somebody happened to post.
  const cells = accounts.map((account) => {
    const sums = moved.get(String(account._id));
    const debits = centsOf(sums?.debits);
    const credits = centsOf(sums?.credits);
    const balance = debits - credits;
    return {
      code: account.code,
      name: account.name,
      type: account.type,
      system: Boolean(account.system),
      debits,
      credits,
      balance,
      // Which column the figure belongs in: a balance that is zero or positive
      // reads on the side its type belongs to, and a NEGATIVE one reads there
      // too. An account on the wrong side is itself the thing the page has to
      // show, and a gap that arrives as a difference between the columns is
      // something a reader can act on — where flipping the negative to the
      // other side would hide the very gap the trial balance exists to report.
      side: NATURAL_DEBIT.has(account.type) && balance >= 0 ? 'debit' : 'credit',
    };
  });

  // The column totals are the sum of the two columns AS PRESENTED, so a reader
  // can add up the column on the page and get this number back.
  let columnDebits = 0;
  let columnCredits = 0;
  for (const cell of cells) {
    if (cell.side === 'debit') columnDebits += cell.balance;
    else columnCredits += -cell.balance;
  }

  const [bills, settlements] = await Promise.all([splitTotals(GroupExpense, group), splitTotals(GroupSettlement, group)]);

  return {
    group: publicGroup(group),
    rows: cells.map((cell) => ({
      code: cell.code,
      name: cell.name,
      type: cell.type,
      system: cell.system,
      debits: centsToNum(cell.debits),
      credits: centsToNum(cell.credits),
      balance: centsToNum(cell.balance),
      side: cell.side,
    })),
    totals: { debits: centsToNum(columnDebits), credits: centsToNum(columnCredits) },
    balanced: columnDebits === columnCredits,
    context: { bills, settlements },
  };
}

/**
 * The open reconciliation, with the whole comparison answered: the book side,
 * the statement side, the five totals, the counts, and — the point of the whole
 * screen — whether this can close and, if not, why.
 *
 * With no open session there is no account being reconciled, so there is no book
 * side to show: the answer is the chart and nothing else, and the page opens on
 * "pick the account, paste the statement".
 */
export async function reconcileView(user, groupId) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'view');
  const accounts = await ensureChart(group);

  const session = await GroupReconcile.findOne({ group: group._id, status: 'draft' });
  if (!session) {
    return {
      group: publicGroup(group),
      accounts: accounts.map(publicAccount),
      session: null,
      ledger: { account: null, balance: 0, items: [] },
    };
  }
  const report = await sessionReport(session, group, accounts);
  // The read is the same report the writes answer with. The fields are at the
  // top level (group, account, accounts, ledger, statement, totals, counts,
  // status, closeable, reason) and the whole report is ALSO under `session`, so
  // a page can read it the way the PATCH and close answers hand it over without
  // this read being a different shape from the writes.
  return { ...report, session: report };
}

/* ---------------------------------- writes --------------------------------- */

/**
 * Post an entry. The only thing the client says is which accounts moved and by
 * how much; the reference, the date's timezone, the balance check and the
 * account lookup are all decided here.
 */
export async function postEntry(user, groupId, payload = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'postJournal');
  const accounts = await ensureChart(group);

  const lines = entryLines(payload.lines, (code) => accountIn(accounts, code));
  return (await writeEntry(group, lines, { date: payload.date, memo: payload.memo, user })).entry;
}

/**
 * The correction: the mirrored entry, posted beside the original.
 *
 * Every debit becomes a credit of the same amount and the other way round, so
 * the two together move nothing — and because the original is left exactly as
 * it was, the journal still shows what was posted and what was done about it.
 * The memo names the reference it undoes, because an entry that reads
 * "Reversal" with no reference is a question nobody can answer a month later.
 */
export async function reverseEntry(user, groupId, entryId, { date } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'postJournal');
  await ensureChart(group);
  const original = await loadEntry(group, entryId);

  const memo = `Reversal of ${original.ref} — posted to undo it. ${original.memo}`.slice(0, MAX_MEMO);
  // The lines are already validated and already balanced, so the mirror of a
  // balanced entry is balanced by construction: swapping sides preserves both
  // totals. They are not re-validated, because re-reading them could only
  // produce a different answer than the entry that is actually stored.
  const mirrored = await writeEntry(
    group,
    original.lines.map((line) => ({
      account: { _id: line.account?._id || line.account },
      code: line.account?.code || '',
      name: line.account?.name || '',
      type: line.account?.type || '',
      side: centsOf(line.debit) > 0 ? 'credit' : 'debit',
      cents: centsOf(line.debit) > 0 ? centsOf(line.debit) : centsOf(line.credit),
    })),
    { date: date || original.date, memo, user, source: 'manual', sourceRef: null }
  );
  return mirrored.entry;
}

/** An auditor's question about an entry. It changes no money — see the model. */
export async function flagEntry(user, groupId, entryId, { reason } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'flag');
  const entry = await loadEntry(group, entryId);

  const note = String(reason || '').trim();
  if (note.length < 3) throw badRequest('Say what looks wrong, in a few words.');
  if (note.length > 200) throw badRequest('A flag can be at most 200 characters long.');

  entry.flag = {
    by: user._id,
    byName: group.members[group.memberIndexOf(user._id)]?.name || '',
    reason: note,
    at: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  };
  await entry.save();
  await entry.populate('lines.account', 'code name type');
  return toPublicEntry(entry, group, group.memberIndexOf(user._id));
}

/** The treasurer's answer to a flag. The entry's money is untouched either way. */
export async function clearEntryFlag(user, groupId, entryId, { note } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'flag');
  const entry = await loadEntry(group, entryId);

  entry.flag = {
    ...(entry.flag ? entry.flag.toObject?.() ?? entry.flag : {}),
    resolvedAt: new Date(),
    resolvedBy: user._id,
    resolution: String(note || '').trim().slice(0, 200),
  };
  await entry.save();
  await entry.populate('lines.account', 'code name type');
  return toPublicEntry(entry, group, group.memberIndexOf(user._id));
}

/**
 * Start a reconciliation: name the account, give the statement's date and
 * balance, paste its lines.
 *
 * Every line is matched against the book on the way in, and the answer comes
 * back with the session ("it found 3 of 5"), because that is the whole value of
 * the feature — nobody opens this screen to type numbers that a computer could
 * have paired for them.
 *
 * MATCHING IS AMOUNT AND DATE, and nothing cleverer. That is exactly what a
 * person does first: the same amount, as close a date as the statement and the
 * books allow. A manual override is always one call away, because two identical
 * amounts on the same day are a real possibility in a group of five splitting a
 * shopping bill, and a matcher that insisted on being right would be worse than
 * one that is honest about being a suggestion.
 */
export async function startReconcile(user, groupId, payload = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'reconcile');
  const accounts = await ensureChart(group);

  const account = assetIn(accounts, payload.accountCode);
  const statementDate = isoDay(payload.statementDate, 'Please give the statement date as a day, like 2026-09-30.');
  const statementBalance = signedCents(
    payload.statementBalance,
    'The statement balance has to be an amount with at most two decimals, e.g. 460.00.'
  );
  const lines = statementLines(payload.lines);
  const book = await bookSide(group, account);
  const matched = matchLines(lines, book.items);

  let session;
  try {
    session = await GroupReconcile.create({
      group: group._id,
      accountCode: account.code,
      statementDate,
      statementBalance: toDec(centsToNum(statementBalance)),
      lines,
      status: 'draft',
      note: String(payload.note || '').trim().slice(0, MAX_MEMO),
      by: group.memberIndexOf(user._id),
      createdBy: user._id,
    });
  } catch (err) {
    // The partial unique index is the real guard against two open sessions; a
    // second one loses the insert and is told what to do about the first.
    if (err?.code !== 11000) throw err;
    throw conflict(
      'This group already has an open reconciliation. Finish or close that one before starting another.'
    );
  }

  return { session: await sessionReport(session, group, accounts), matched };
}

/**
 * Classify one statement line: `book` (the group's own money — the entry is
 * posted here and now), `ignore` (not the group's money, and a reason is
 * required), or `open` (undecided again).
 *
 * A line that already has an entry behind it cannot be re-classified. That is
 * not caution, it is the immutability rule: the books keep the entry, so
 * re-opening the line would leave money in the ledger that the statement says
 * is not there, and the way back is to reverse the entry.
 */
export async function classifyStatementLine(user, groupId, sessionId, key, payload = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'reconcile');
  const accounts = await ensureChart(group);
  const session = await loadSession(group, sessionId);
  if (session.status !== 'draft') throw badRequest('This reconciliation is closed — start a new one to carry on.');

  const line = session.lines.find((row) => row.key === key);
  if (!line) throw notFound('That statement line is not in this reconciliation.');

  const as = String(payload.as || '').trim();
  if (!['book', 'ignore', 'open'].includes(as)) {
    throw badRequest('Classify the line as book, ignore or open.');
  }
  if (line.entryId) {
    throw badRequest(
      `That line was booked as ${refOf(session, line.entryId)} and the books keep it. Reverse that entry first, then change the line.`
    );
  }

  if (as === 'ignore') {
    const reason = String(payload.reason || '').trim();
    if (!reason) {
      throw badRequest(
        'Write down why this line is not the group’s money, e.g. "a transfer from a housemate who shares the account".'
      );
    }
    if (reason.length > 200) throw badRequest('A reason can be at most 200 characters long.');
    line.as = 'ignore';
    line.reason = reason;
    line.at = new Date();
    await session.save();
    return sessionReport(session, group, accounts);
  }

  if (as === 'open') {
    line.as = 'open';
    line.reason = '';
    line.at = new Date();
    await session.save();
    return sessionReport(session, group, accounts);
  }

  // as === 'book': the right double entry, decided by the sign of the amount, so
  // the two sides cannot be swapped by accident.
  const amount = centsOf(line.amount);
  const moneyIn = amount > 0;
  const counterpart = moneyIn
    ? accountIn(accounts, String(payload.expenseCode || MONEY_IN_DEFAULT), 'income', 'money coming in has to be counted as income')
    : accountIn(accounts, String(payload.expenseCode || MONEY_OUT_DEFAULT), 'expense', 'the account the money went out to has to be an expense');

  const account = assetIn(accounts, session.accountCode);
  const lines = [
    {
      account,
      code: account.code,
      name: account.name,
      type: account.type,
      side: moneyIn ? 'debit' : 'credit',
      cents: Math.abs(amount),
    },
    {
      account: counterpart,
      code: counterpart.code,
      name: counterpart.name,
      type: counterpart.type,
      cents: Math.abs(amount),
      side: moneyIn ? 'credit' : 'debit',
    },
  ];

  const entry = await writeEntry(group, lines, {
    date: line.date,
    memo: String(payload.memo || line.description || `Statement ${session.statementDate} line ${line.key}`).trim().slice(0, MAX_MEMO),
    user,
    source: 'reconcile',
    sourceRef: line.key,
  });

  line.as = 'book';
  line.reason = '';
  line.at = new Date();
  line.entryId = entry.entryId;
  line.entryLineId = entry.accountLineId;
  await session.save();
  return sessionReport(session, group, accounts);
}

/**
 * Mark a book line as still in transit (a cheque issued, a transfer not yet
 * showing) — or take the mark back. It moves the counts, never the money: the
 * line is in the books either way, and the difference is about the bank's
 * figure, which this does not touch.
 */
export async function markBookOutstanding(user, groupId, sessionId, lineId, { outstanding } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'reconcile');
  const accounts = await ensureChart(group);
  const session = await loadSession(group, sessionId);
  if (session.status !== 'draft') throw badRequest('This reconciliation is closed — start a new one to carry on.');

  if (outstanding !== true && outstanding !== false) {
    throw badRequest('Say whether the line is outstanding: true or false.');
  }
  if (!mongoose.isValidObjectId(lineId)) throw notFound('That book line is not on this account.');

  const account = assetIn(accounts, session.accountCode);
  const book = await bookSide(group, account);
  const item = book.items.find((row) => row.lineId === String(lineId));
  if (!item) throw notFound('That book line is not on this account.');

  const matchedBy = session.lines.find((row) => row.entryLineId && String(row.entryLineId) === item.lineId);
  if (matchedBy) {
    throw badRequest(
      `That book line is already matched to statement line ${matchedBy.key}, so it is not in transit.`
    );
  }
  const booked = session.lines.find((row) => row.as === 'book' && row.entryLineId && String(row.entryLineId) === item.lineId);
  if (booked) {
    throw badRequest(
      `That book line is the one written for statement line ${booked.key}, so it is already on the statement.`
    );
  }

  const held = (session.outstanding || []).map(String);
  const at = held.indexOf(item.lineId);
  if (outstanding && at < 0) held.push(item.lineId);
  if (!outstanding && at >= 0) held.splice(at, 1);
  session.outstanding = held;
  await session.save();

  return sessionReport(session, group, accounts);
}

/**
 * Close the reconciliation — only when it is actually finished.
 *
 * A reconciliation that closed on a difference would be worse than no
 * reconciliation at all: it would put a stamp on two sets of numbers that do not
 * agree and call the gap explained. So the three conditions are all of them
 * required, the refusal names the number and the lines responsible, and closing
 * is the one write in this file that answers 409 instead of 400.
 */
export async function closeReconcile(user, groupId, sessionId) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'reconcile');
  const accounts = await ensureChart(group);
  const session = await loadSession(group, sessionId);

  const report = await sessionReport(session, group, accounts);
  if (session.status !== 'draft') {
    throw badRequest('This reconciliation is already closed.');
  }
  if (!report.closeable) throw conflict(report.reason);

  session.status = 'reconciled';
  session.reconciledAt = new Date();
  session.reconciledBy = user._id;
  await session.save();
  return sessionReport(session, group, accounts);
}

/* ------------------------------- the chart --------------------------------- */

/**
 * The chart of accounts for a group, seeded the first time anybody asks for it.
 *
 * Seeded HERE rather than at group creation so a group made before this feature
 * started working the first time somebody opened the journal, and so a group
 * created by any other means (a seed script, a restore) is never left without
 * one.
 *
 * The race is real: two people opening an empty group in the same second both
 * read "no accounts" and both try to insert the twelve rows. The unique index on
 * `{ group, code }` refuses the loser, and because the only thing that matters
 * is what the collection holds afterwards, a refused insert is re-read rather
 * than reported — there is no error to show a student, only a chart.
 */
async function ensureChart(group) {
  const existing = await GroupAccount.find({ group: group._id }).sort({ code: 1 }).lean();
  if (existing.length > 0) return existing;

  try {
    await GroupAccount.insertMany(
      CHART.map((row) => ({ ...row, group: group._id, system: true })),
      { ordered: false }
    );
  } catch (err) {
    const after = await GroupAccount.countDocuments({ group: group._id });
    if (after === 0) throw err;
  }
  return GroupAccount.find({ group: group._id }).sort({ code: 1 }).lean();
}

/* ------------------------------ the reconciliation -------------------------- */

/**
 * The book side of a reconciliation, DERIVED from the journal on every read.
 *
 * It is never cached or copied onto the session, so it cannot fall out of step
 * with the books: a correction posted here, a day later, moves the balance on
 * this screen with nothing to update. The projection unwinds the lines and the
 * sum is done in whole cents on the way out, over exactly the rows the page is
 * shown, so the balance and the list can never disagree with each other.
 */
async function bookSide(group, account) {
  const rows = await GroupJournalEntry.aggregate([
    { $match: { group: group._id, 'lines.account': account._id } },
    { $unwind: '$lines' },
    { $match: { 'lines.account': account._id } },
    {
      $project: {
        entryId: '$_id',
        lineId: '$lines._id',
        ref: 1,
        date: 1,
        memo: 1,
        debit: '$lines.debit',
        credit: '$lines.credit',
      },
    },
    { $sort: { date: 1, lineId: 1 } },
  ]);

  let balance = 0;
  const items = rows.map((row) => {
    const debit = centsOf(row.debit);
    const credit = centsOf(row.credit);
    // On an asset a debit brings money in, so the line's effect on the balance
    // is debit − credit. The same arithmetic reads a liability correctly if the
    // account is ever changed, which is why it is not a per-type branch.
    const amount = debit - credit;
    balance += amount;
    return {
      lineId: String(row.lineId),
      entryId: String(row.entryId),
      ref: row.ref,
      date: new Date(row.date).toISOString(),
      memo: row.memo || '',
      amountCents: amount,
      side: debit > 0 ? 'debit' : 'credit',
    };
  });

  return { balanceCents: balance, items };
}

/**
 * Pair each statement line with a book line of the same signed amount and the
 * closest date within five days, and mark what it found.
 *
 * Nearest date wins; on a tie the earlier book line does, because the list is
 * sorted by date and a stable first choice is easier to reason about than an
 * arbitrary one. A book line is used once.
 */
function matchLines(statementLines, bookItems) {
  const used = new Set();
  let matched = 0;

  for (const line of statementLines) {
    const amount = centsOf(line.amount);
    const day = Date.parse(`${line.date}T00:00:00.000Z`);
    let best = null;
    let bestGap = MATCH_DAYS + 1;

    for (const item of bookItems) {
      if (used.has(item.lineId) || item.amountCents !== amount) continue;
      const gap = Math.abs(Math.round((Date.parse(`${item.date.slice(0, 10)}T00:00:00.000Z`) - day) / 86400000));
      if (gap > MATCH_DAYS || gap >= bestGap) continue;
      best = item;
      bestGap = gap;
    }
    if (!best) continue;

    used.add(best.lineId);
    line.as = 'matched';
    line.entryId = oid(best.entryId);
    line.entryLineId = oid(best.lineId);
    line.at = new Date();
    matched += 1;
  }

  return matched;
}

/**
 * The whole comparison, answered on every read so the page never does any
 * arithmetic of its own — including the arithmetic that decides whether this
 * can close.
 */
async function sessionReport(session, group, accounts) {
  const account = accounts.find((row) => row.code === session.accountCode) || null;
  const book = account ? await bookSide(group, account) : { balanceCents: 0, items: [] };

  const byKey = new Map();
  const bookedHere = new Set();
  for (const line of session.lines) {
    if (line.entryLineId) byKey.set(String(line.entryLineId), line.key);
    if (line.as === 'book' && line.entryLineId) bookedHere.add(String(line.entryLineId));
  }
  const flagged = new Set((session.outstanding || []).map(String));

  const items = [];
  const unclassified = [];
  let outstandingCount = 0;
  for (const item of book.items) {
    const matchedBy = byKey.get(item.lineId) || null;
    const outstanding = flagged.has(item.lineId);
    if (outstanding) outstandingCount += 1;
    // A book line is classified when it is matched to a statement line, or
    // marked in transit, or IS the entry this session wrote for one of its own
    // `book` lines — that last case is the group's own work, already explained
    // by the line it was written for.
    if (!matchedBy && !outstanding && !bookedHere.has(item.lineId)) unclassified.push(item);
    items.push({
      lineId: item.lineId,
      entryId: item.entryId,
      ref: item.ref,
      date: item.date,
      memo: item.memo,
      amount: centsToNum(item.amountCents),
      side: item.side,
      matchedBy,
      outstanding,
    });
  }

  const counts = {
    matched: session.lines.filter((line) => line.as === 'matched').length,
    toBook: session.lines.filter((line) => line.as === 'book').length,
    ignored: session.lines.filter((line) => line.as === 'ignore').length,
    open: session.lines.filter((line) => line.as === 'open').length,
    outstanding: outstandingCount,
  };

  // `unbooked` is the money the statement says moved and the books have NOT been
  // told about: the statement lines marked as the group's own money that have
  // no entry behind them. Marking a line `book` posts the entry in the same
  // request, so on a session classified through the API this reads zero — and
  // it is reported as its own number rather than folded into bookBalance,
  // because a bank statement line is exactly this: money in one set of records
  // that the other has not caught up with. Folding it into the balance instead
  // would count the same money twice.
  const unbooked = session.lines
    .filter((line) => line.as === 'book' && !line.entryId)
    .reduce((sum, line) => sum + centsOf(line.amount), 0);

  const bookBalance = book.balanceCents;
  const adjustedBook = bookBalance + unbooked;
  const statementBalance = centsOf(session.statementBalance);
  const difference = statementBalance - adjustedBook;

  // the statement lines, built ONCE and handed out under both names. The report
  // calls them statement.lines and the whole session is also known as
  // session.lines; a caller should not have to know which one it is reading.
  const statementLines = session.lines.map((line) => ({
    key: line.key,
    date: line.date,
    description: line.description || '',
    amount: centsToNum(centsOf(line.amount)),
    as: line.as,
    entryId: line.entryId ? line.entryId.toString() : null,
    entryLineId: line.entryLineId ? line.entryLineId.toString() : null,
    reason: line.reason || '',
    at: line.at ? new Date(line.at).toISOString() : null,
  }));

  const report = {
    closeable: false,
    reason: '',
  };

  const refusals = [];
  if (counts.open > 0) {
    const keys = session.lines.filter((line) => line.as === 'open').map((line) => line.key);
    refusals.push(
      `${counts.open} statement line${counts.open === 1 ? '' : 's'} still open (${named(keys)}). Classify ${counts.open === 1 ? 'it' : 'each of them'} as book or ignore.`
    );
  }
  if (unclassified.length > 0) {
    const refs = named(unclassified.map((item) => item.ref));
    refusals.push(
      `${unclassified.length} book line${unclassified.length === 1 ? '' : 's'} (${refs}) ${unclassified.length === 1 ? 'is' : 'are'} on neither the statement nor in transit. Match ${unclassified.length === 1 ? 'it' : 'each of them'} or mark ${unclassified.length === 1 ? 'it' : 'them'} outstanding.`
    );
  }
  if (difference !== 0) {
    refusals.push(
      `The statement says ${centsText(statementBalance)} and the books, with the unbooked lines, come to ${centsText(adjustedBook)} — a difference of ${centsText(Math.abs(difference))}. Book or explain it before closing.`
    );
  }
  report.closeable = refusals.length === 0;
  report.reason = refusals.join(' ');

  return {
    group: publicGroup(group),
    id: session._id.toString(),
    account: account ? publicAccount(account) : null,
    accounts: accounts.map(publicAccount),
    ledger: { balance: centsToNum(bookBalance), items },
    statement: {
      date: session.statementDate,
      balance: centsToNum(statementBalance),
      lines: statementLines,
    },
    // the same array again, for the caller that reads a session as a session
    lines: statementLines,
    totals: {
      bookBalance: centsToNum(bookBalance),
      unbooked: centsToNum(unbooked),
      adjustedBook: centsToNum(adjustedBook),
      statementBalance: centsToNum(statementBalance),
      difference: centsToNum(difference),
    },
    counts,
    status: session.status,
    note: session.note || '',
    by: session.by,
    createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : null,
    reconciledAt: session.reconciledAt ? new Date(session.reconciledAt).toISOString() : null,
    reconciledBy: session.reconciledBy ? session.reconciledBy.toString() : null,
    closeable: report.closeable,
    reason: report.reason,
  };
}

/* ----------------------------- writing an entry ---------------------------- */

/**
 * The one place an entry is created, so the balance rule, the reference and the
 * provenance fields cannot be forgotten on one of the three paths in (a post, a
 * reversal, a line booked from a statement).
 */
async function writeEntry(group, lines, { date, memo, user, source = 'manual', sourceRef = null }) {
  const { debits, credits } = columnsOf(lines);
  if (debits !== credits) {
    throw badRequest(
      `An entry has to balance: these lines are ${centsText(debits)} of debits against ${centsText(credits)} of credits, a difference of ${centsText(Math.abs(debits - credits))}. Add a line for the missing ${debits > credits ? 'credit' : 'debit'}.`
    );
  }

  const entry = await GroupJournalEntry.create({
    group: group._id,
    ref: await nextRef(group),
    date: utcDay(date),
    memo: String(memo || '').trim().slice(0, MAX_MEMO),
    lines: lines.map((line) => ({
      account: line.account._id,
      debit: line.side === 'debit' ? toDec(centsToNum(line.cents)) : null,
      credit: line.side === 'credit' ? toDec(centsToNum(line.cents)) : null,
    })),
    source,
    sourceRef,
    by: group.memberIndexOf(user._id),
    createdBy: user._id,
  });
  await entry.populate('lines.account', 'code name type');
  // The public entry, plus the two handles a reconciliation needs: the entry's
  // id, and the id of the line that sits on the account being reconciled — the
  // one that shows up on the book side of the next comparison.
  return {
    entry: toPublicEntry(entry, group, group.memberIndexOf(user._id)),
    entryId: entry._id,
    accountLineId: entry.lines[0]._id,
  };
}

/**
 * `J-0001`, `J-0002`, … per group, from the highest one already there. The
 * client never sends a reference, so nobody can claim a number that is taken.
 *
 * Sorted as text, which is why the sequence is zero-padded to four digits: it
 * keeps the order right for the first 9999 entries of a group, which is more
 * than a hostel writes in a lifetime.
 */
async function nextRef(group) {
  const highest = await GroupJournalEntry.findOne({ group: group._id })
    .sort({ ref: -1, _id: -1 })
    .select('ref')
    .lean();
  const last = Number.parseInt(String(highest?.ref || 'J-0000').slice(2), 10) || 0;
  return `J-${String(last + 1).padStart(4, '0')}`;
}

/* ------------------------------ reading a line ----------------------------- */

/**
 * The lines of a posted entry, validated and resolved to real accounts, and
 * refused unless the two columns are equal. This is the rule: nothing reaches
 * the collection until it has been through here.
 */
function entryLines(raw, resolveCode) {
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length < MIN_LINES) {
    throw badRequest(
      `A journal entry needs at least ${MIN_LINES} lines — one debit and one credit. A single line is a typo, not a transaction.`
    );
  }
  if (rows.length > MAX_LINES) {
    throw badRequest(`A journal entry can have at most ${MAX_LINES} lines. Split it into two entries.`);
  }
  return rows.map((row, i) => buildLine(row, i + 1, resolveCode));
}

function buildLine(row, at, resolveCode) {
  const code = String(row?.code ?? '').trim();
  const account = resolveCode(code);
  const debit = sideCents(row?.debit, `Line ${at}'s debit`);
  const credit = sideCents(row?.credit, `Line ${at}'s credit`);

  // Refused BY NAME, never netted. A line carrying both sides is somebody's
  // mistake about which column they were in, and quietly netting it would hide
  // the mistake and change what the entry says.
  if (debit > 0 && credit > 0) {
    throw badRequest(
      `Line ${at} has a debit of ${centsText(debit)} and a credit of ${centsText(credit)}. A line is on one side only — put the credit on its own line.`
    );
  }
  if (debit <= 0 && credit <= 0) {
    throw badRequest(
      `Line ${at} has no amount on it. Put the amount on the debit side or the credit side, and make it more than 0.`
    );
  }

  return {
    account,
    code: account.code,
    name: account.name,
    type: account.type,
    side: debit > 0 ? 'debit' : 'credit',
    cents: debit > 0 ? debit : credit,
  };
}

function columnsOf(lines) {
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    if (line.side === 'debit') debits += line.cents;
    else credits += line.cents;
  }
  return { debits, credits };
}

/* ----------------------------- the statement ------------------------------- */

/**
 * The pasted statement, as lines. Amounts are SIGNED, because a statement lists
 * what left the account as well as what arrived, and a line of 0.00 is not a
 * line — there is nothing to classify.
 */
function statementLines(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length < 1) throw badRequest('Paste at least one line from the statement.');
  if (rows.length > MAX_STATEMENT_LINES) {
    throw badRequest(`A statement can have at most ${MAX_STATEMENT_LINES} lines here — split the reconciliation.`);
  }

  const used = new Set();
  return rows.map((row, i) => {
    const key = statementKey(row?.key, i, used);
    const date = isoDay(row?.date, 'Give every statement line a date, like 2026-09-30.');
    const amount = signedCents(row?.amount, 'Every statement line needs an amount, positive for money in and negative for money out.');
    if (amount === 0) throw badRequest(`Statement line ${key} has an amount of 0.00, so there is nothing to classify.`);
    const description = String(row?.description ?? '').trim();
    if (description.length > 120) throw badRequest(`Line ${key}'s description can be at most 120 characters long.`);

    return { key, date, description, amount: toDec(centsToNum(amount)), as: 'open', entryId: null, entryLineId: null, reason: '', at: null };
  });
}

/** Short, unique inside the session, and never a line the client can rename. */
function statementKey(raw, at, used) {
  const wanted = String(raw ?? '').trim();
  const pattern = /^[A-Za-z0-9_-]{1,20}$/;
  let key = pattern.test(wanted) && !used.has(wanted) ? wanted : '';
  if (!key) {
    let seat = at + 1;
    while (used.has(`S${seat}`)) seat += 1;
    key = `S${seat}`;
  }
  used.add(key);
  return key;
}

/* ------------------------------ public shapes ----------------------------- */

/**
 * One entry as the page reads it: the header totals, the lines with their
 * account names, and who posted it. `viewerIndex` is the reader's own seat, and
 * it is the only way this can tell "my entry" from somebody else's.
 */
export function toPublicEntry(entry, group, viewerIndex) {
  // The header totals are added up in cents, from the stored Decimal128s, and
  // only turned into numbers at the very end of this function.
  const { debits, credits } = columnsOf(
    entry.lines.map((line) => ({
      side: centsOf(line.debit) > 0 ? 'debit' : 'credit',
      cents: centsOf(line.debit) > 0 ? centsOf(line.debit) : centsOf(line.credit),
    }))
  );

  const lines = entry.lines.map((line) => {
    const debit = centsOf(line.debit);
    const credit = centsOf(line.credit);
    const account = line.account || {};
    return {
      lineId: line._id ? line._id.toString() : null,
      code: account.code || '',
      name: account.name || '',
      type: account.type || '',
      debit: centsToNum(debit),
      credit: centsToNum(credit),
      side: debit > 0 ? 'debit' : 'credit',
    };
  });

  return {
    id: entry._id.toString(),
    ref: entry.ref,
    date: new Date(entry.date).toISOString(),
    memo: entry.memo,
    source: entry.source || 'manual',
    sourceRef: entry.sourceRef || null,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
    by: { index: entry.by, name: group.members[entry.by]?.name || '' },
    isYou: entry.by === viewerIndex,
    debits: centsToNum(debits),
    credits: centsToNum(credits),
    lines,
    flag: entry.flag
      ? {
          by: entry.flag.by ? entry.flag.by.toString() : null,
          byName: entry.flag.byName || '',
          reason: entry.flag.reason,
          at: entry.flag.at ? new Date(entry.flag.at).toISOString() : null,
          resolvedAt: entry.flag.resolvedAt ? new Date(entry.flag.resolvedAt).toISOString() : null,
          resolution: entry.flag.resolution || '',
          open: !entry.flag.resolvedAt,
        }
      : null,
  };
}

function publicAccount(account) {
  return {
    id: account._id.toString(),
    code: account.code,
    name: account.name,
    type: account.type,
    system: Boolean(account.system),
  };
}

function publicGroup(group) {
  return { id: group._id.toString(), name: group.name, currency: group.currency };
}

/* --------------------------------- helpers --------------------------------- */

/** This group's own account, by code. Anything else is a 400, by name. */
function accountIn(accounts, code, type, why) {
  const clean = String(code ?? '').trim();
  if (!/^\d{4}$/.test(clean)) {
    throw badRequest('An account code is four digits, e.g. 1010 for Bank account. Open the journal to see this group’s accounts.');
  }
  const account = accounts.find((row) => row.code === clean);
  // Resolved against the CALLING group's chart only, so a code that exists in
  // some other group's books is as unreachable here as one that exists nowhere.
  if (!account) {
    throw badRequest(
      `Account ${clean} is not in this group’s books. Post to one of this group’s own accounts — the journal lists them.`
    );
  }
  if (type && account.type !== type) {
    throw badRequest(
      `Account ${clean} (${account.name}) is not an ${type} account: ${why}. Post the other side to ${type === 'income' ? MONEY_IN_DEFAULT : MONEY_OUT_DEFAULT}, or another ${type} account.`
    );
  }
  return account;
}

/** A reconciliation is about one account, and only an account can have one. */
function assetIn(accounts, code) {
  const clean = String(code ?? '').trim();
  if (!/^\d{4}$/.test(clean)) {
    throw badRequest('Choose the account being reconciled, e.g. 1010 for Bank account.');
  }
  const account = accounts.find((row) => row.code === clean);
  if (!account) {
    throw badRequest(`Account ${clean} is not in this group’s books, so there is nothing to reconcile.`);
  }
  if (account.type !== 'asset') {
    throw badRequest(
      `Account ${clean} (${account.name}) is a ${account.type}, and only an account that holds money can be reconciled against a bank statement.`
    );
  }
  return account;
}

/** The reference an entry was posted for, for a sentence that has to name it. */
function refOf(session, entryId) {
  const line = session.lines.find((row) => row.entryId && String(row.entryId) === String(entryId));
  return line ? `statement line ${line.key}` : 'a statement line';
}

/** One line of this group's journal, and only of this group. */
async function loadEntry(group, entryId) {
  if (!mongoose.isValidObjectId(entryId)) throw notFound('Journal entry not found.');
  const entry = await GroupJournalEntry.findOne({ _id: entryId, group: group._id });
  if (!entry) throw notFound('Journal entry not found.');
  await entry.populate('lines.account', 'code name type');
  return entry;
}

/** One open session of this group, and only of this group. */
async function loadSession(group, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw notFound('Reconciliation not found.');
  const session = await GroupReconcile.findOne({ _id: sessionId, group: group._id });
  if (!session) throw notFound('Reconciliation not found.');
  return session;
}

/** The split board's two counters, read by aggregation like the rest of the module. */
async function splitTotals(model, group) {
  const rows = await model.aggregate([
    { $match: { group: group._id } },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]);
  return { count: rows[0]?.count || 0, total: toNum(rows[0]?.total) || 0 };
}

/** How many entries a page holds: the default is a screen, the cap is the work. */
function pageSize(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw badRequest('Ask for a whole number of entries, e.g. 25.');
  return Math.min(n, MAX_PAGE);
}

/** `before` is a calendar day, or the id of an entry to page back from. */
async function beforePage(group, before) {
  if (before === undefined || before === null || before === '') return {};
  if (mongoose.isValidObjectId(before)) {
    const entry = await GroupJournalEntry.findOne({ _id: before, group: group._id }).select('date').lean();
    if (!entry) throw notFound('Journal entry not found.');
    // The id, not just the day: two entries posted on one day share a date, and
    // paging on the date alone would serve the whole day a second time.
    return { $or: [{ date: { $lt: entry.date } }, { date: entry.date, _id: { $lt: entry._id } }] };
  }
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(before));
  if (!day || Number.isNaN(Date.parse(`${day[0]}T00:00:00.000Z`))) {
    throw badRequest('Page back with a day like 2026-09-10, or with the id of a journal entry.');
  }
  return { date: { $lt: new Date(`${day[0]}T00:00:00.000Z`) } };
}

/** A calendar day, stored at UTC midnight exactly as the rest of the app does. */
function utcDay(value) {
  if (value === undefined || value === null || value === '') return new Date();
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  const date = day ? new Date(`${day[0].slice(0, 10)}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw badRequest('Please pick a valid date for the entry, like 2026-09-10.');
  }
  return date;
}

/** A date a statement line carries, kept as the text the bank printed. */
function isoDay(value, message) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) {
    throw badRequest(message);
  }
  return text;
}

/**
 * Whole cents, read out of the DIGITS of a number rather than out of a float.
 * "33.33" is 33 x 100 + 33, not 33.33 x 100, so nothing here can drift by a
 * cent and no comparison is ever made on a float. The fallback only covers the
 * shapes a database may print (1E+2), never the parsing of a real amount.
 */
function centsOf(value) {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === 'object' && value.$numberDecimal !== undefined ? value.$numberDecimal : value;
  const text = String(raw).trim();
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  const [, sign, whole, frac = ''] = match;
  return (sign === '-' ? -1 : 1) * (Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2)));
}

/** One side of a journal line: absent or zero is "not on this side". */
function sideCents(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw badRequest(
      `${label} must be an amount with at most two decimals, e.g. 12.50 — "${text}" is not one.`
    );
  }
  return centsOf(text);
}

/** A statement amount or balance: signed, because both are real in money. */
function signedCents(value, message) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw badRequest(message);
  return centsOf(text);
}

/** Integer cents out to the API edge, rounded to two decimals — never a float on
 *  the way to a figure somebody is going to add up. */
function centsToNum(cents) {
  return toNum(toDec(cents / 100));
}

/** Cents into the one human-readable form a refusal can use. */
function centsText(cents) {
  return formatMoney(centsToNum(cents));
}

/** "S1, S2, S7, S9" — enough to act on, and no wall of text. */
function named(values) {
  const head = values.slice(0, NAMED_IN_A_SENTENCE);
  return values.length > NAMED_IN_A_SENTENCE
    ? `${head.join(', ')} and ${values.length - NAMED_IN_A_SENTENCE} more`
    : head.join(', ');
}

function oid(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

function notFound(message = 'Group not found.') {
  const err = new Error(message);
  err.status = 404;
  return err;
}
