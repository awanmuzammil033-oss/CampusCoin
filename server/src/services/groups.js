import mongoose from 'mongoose';

import Group from '../models/Group.js';
// from the NEUTRAL module, not from services/accountDeletion.js: that module
// reaches config/env.js, which reads MONGODB_URI once at load time, and the test
// harness sets that variable at runtime - so this import broke every suite that
// imports this file. See constants/formerMember.js for the whole story.
import { isFormerMember } from '../constants/formerMember.js';
import GroupExpense from '../models/GroupExpense.js';
import GroupSettlement from '../models/GroupSettlement.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import { toDec, toNum, formatMoney, isPositiveAmount } from '../utils/money.js';

/**
 * Shared groups (GRP-1..3): a hostel room, a flat, a project team.
 *
 * Everything a group does lives here, not in the router. Two rules shape the
 * whole module:
 *
 *  1. ISOLATION — every read starts at the person, not at the id. A group is
 *     only ever found through `loadGroupFor` (owner or member) or
 *     `loadAdminGroup`, so somebody who is not in the group gets a 404 and
 *     never a byte of it. Bills and settlements are then scoped by group id.
 *
 *  2. MONEY — the split is worked out once, on the server, in whole cents,
 *     and stored as Decimal128 (`GroupExpense.split`). Totals are summed by
 *     the database ($match / $unwind / $group / $sum); JavaScript only turns
 *     the handful of aggregate rows into the final arithmetic.
 *
 * THE REMAINDER RULE (uneven splits)
 * ---------------------------------
 * A bill rarely divides exactly, and 33.33 x 3 is 99.99. So the amount is
 * split in whole cents, every cent is handed out exactly once, and the members
 * who were cut off by a fraction compete for the leftover cents: the largest
 * cut-off fraction wins, and equal fractions are broken by member order, so
 * the first member (the owner, index 0) always takes the odd cent. 100.00
 * split three ways is therefore 33.34 / 33.33 / 33.33 — the shares add up to
 * the bill to the cent, every time, with no rounding drift.
 *
 * The rule works over a list of weights, not over a head count, which is why it
 * covers both kinds of bill (GRP-2): a bill can name the people it is split
 * between, and "three of these five" is the same call with three weights.
 */

const MAX_MEMBERS = 20;
const MAX_BILLS = 200;
const MAX_SETTLEMENTS = 100;

/* --------------------------------- reads ---------------------------------- */

/**
 * A member's email is the promise that the account is coming. This is what keeps
 * it: the first time the person registers, signs in, or opens the groups list,
 * the member row is filled in with their account id — and because the list
 * matches on `members.user`, the group is simply there afterwards. Nothing is
 * asked of the student.
 *
 * ONE query, and deliberately an `updateMany` with an array filter rather than
 * a find-then-save loop:
 *  - the same element is named on both sides (`members.email` chooses the
 *    group, `roomie.email` chooses the row inside it), so a member who is
 *    ALREADY linked never matches and can never be overwritten, and one
 *    member's row can never be matched by POSITION — the mistake a bare `$`
 *    positional operator would make;
 *  - the repair happens inside the database, so two people registering in the
 *    same second cannot each read the same group and write it back.
 * `modifiedCount` is the honest answer to "how many groups were linked": a group
 * that was already linked is not counted again.
 */
export async function linkGroupsForEmail(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email) return { linked: 0 };

  const result = await Group.updateMany(
    { 'members.email': email, 'members.user': null },
    { $set: { 'members.$[roomie].user': user._id } },
    { arrayFilters: [{ 'roomie.email': email, 'roomie.user': null }] }
  );

  return { linked: result.modifiedCount || 0 };
}

/**
 * The group list with its counters. One aggregation: the member count comes
 * from the document, the bill and settlement counts (and the last activity)
 * from $lookups, so the page never counts rows itself.
 */
export async function listGroups(user, { includeArchived = false } = {}) {
  // The self-healing sweep: an account that already existed when the linking
  // shipped is repaired here, the first time the student opens their groups.
  // It is one indexed update on `members.email` and never a read per group, so
  // the list cannot get visibly slower for it — and it runs BEFORE the
  // aggregation, so a group linked by it is in the answer to this very request.
  await linkGroupsForEmail(user);

  const match = { $or: [{ owner: user._id }, { 'members.user': user._id }] };
  if (!includeArchived) match.archived = { $ne: true };

  const countIn = (from, field) => ({
    $lookup: {
      from,
      let: { gid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$group', '$$gid'] } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' }, last: { $max: field } } },
      ],
      as: from,
    },
  });

  const rows = await Group.aggregate([
    { $match: match },
    countIn('groupexpenses', '$date'),
    countIn('groupsettlements', '$date'),
    { $sort: { updatedAt: -1, name: 1 } },
    {
      $project: {
        name: 1,
        currency: 1,
        archived: 1,
        createdAt: 1,
        updatedAt: 1,
        isOwner: { $eq: ['$owner', user._id] },
        memberCount: { $size: '$members' },
        // the viewer's own seat and role, without loading the member rows: the
        // list shows what each group allows, and a second query per row to find
        // out would be the slowest thing on the screen.
        //
        // The roles are gathered with $map and NOT with `$members.role`, because
        // projecting a field out of an array of subdocuments DROPS the documents
        // that have no value for it. A group whose owner has no stored role - the
        // role is implied - would come back with a shorter array, and every index
        // after the gap would name the wrong person. $map keeps the positions and
        // fills the gaps with null, which is what an index needs.
        myIndex: { $indexOfArray: ['$members.user', user._id] },
        myRole: {
          $let: {
            vars: { at: { $indexOfArray: ['$members.user', user._id] } },
            in: {
              $ifNull: [
                { $arrayElemAt: [{ $map: { input: '$members', as: 'm', in: '$$m.role' } }, '$$at'] },
                null,
              ],
            },
          },
        },
        expenseCount: { $ifNull: [{ $arrayElemAt: ['$groupexpenses.count', 0] }, 0] },
        settlementCount: { $ifNull: [{ $arrayElemAt: ['$groupsettlements.count', 0] }, 0] },
        billedTotal: { $ifNull: [{ $arrayElemAt: ['$groupexpenses.total', 0] }, 0] },
        lastBillOn: { $arrayElemAt: ['$groupexpenses.last', 0] },
        lastSettleOn: { $arrayElemAt: ['$groupsettlements.last', 0] },
      },
    },
  ]);

  return rows
    .map((row) => ({
      id: String(row._id),
      name: row.name,
      currency: row.currency,
      archived: Boolean(row.archived),
      isOwner: Boolean(row.isOwner),
      memberCount: row.memberCount,
      // position 0 is the owner, so it is an admin whatever the row says
      viewer: capabilitiesForRole(
        row.myIndex === 0 ? 'admin' : row.myRole || 'member',
        Number(row.myIndex ?? -1)
      ),
      expenseCount: row.expenseCount,
      settlementCount: row.settlementCount,
      billedTotal: toNum(row.billedTotal) || 0,
      lastActivity: latest(row.lastBillOn, row.lastSettleOn, row.updatedAt || row.createdAt),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    }))
    .sort((a, b) => String(b.lastActivity || '').localeCompare(String(a.lastActivity || '')));
}

/** One group in full: who is in it, every bill, every settlement, the board. */
export async function groupDetail(user, groupId) {
  const group = await loadGroupFor(user, groupId);
  const [expenses, settlements, balances] = await Promise.all([
    GroupExpense.find({ group: group._id })
      .sort({ date: -1, createdAt: -1 })
      .limit(MAX_BILLS)
      .populate('category', 'name icon'),
    GroupSettlement.find({ group: group._id }).sort({ date: -1, createdAt: -1 }).limit(MAX_SETTLEMENTS),
    balancesFor(group),
  ]);

  return {
    group: toPublicGroup(group, user),
    members: group.members.map((member, index) => toPublicMember(member, index, group)),
    expenses: expenses.map((expense) => toPublicExpense(expense, group)),
    settlements: settlements.map((row) => toPublicSettlement(row, group)),
    balances,
  };
}

/* --------------------------------- writes --------------------------------- */

/** The creator is always members[0]; everybody after that is a roommate. */
export async function createGroup(user, { name, currency, members } = {}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw badRequest('Please give the group a name.');
  if (cleanName.length > 60) throw badRequest('A group name can be at most 60 characters long.');

  const code = currencyCode(currency);
  const invited = Array.isArray(members) ? members : [];
  if (invited.length > MAX_MEMBERS - 1) {
    throw badRequest(`A group holds at most ${MAX_MEMBERS} people.`);
  }

  const people = await resolvePeople(invited, user);
  const rows = [
    { user: user._id, name: user.name, email: user.email || '', addedAt: new Date() },
    ...people,
  ];

  const group = await Group.create({ name: cleanName, owner: user._id, currency: code, members: rows });
  return toPublicGroup(group, user);
}

/** Owner only — a roommate is added, never removed, so no index can shift. */
export async function addMember(user, groupId, { name, email, userId } = {}) {
  const group = await loadAdminGroup(user, groupId, 'manage');
  if (group.members.length >= MAX_MEMBERS) {
    throw badRequest(`A group holds at most ${MAX_MEMBERS} people.`);
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail && !userId) {
    throw badRequest('Give the roommate a name — an email address helps us link their account later.');
  }

  const clash = group.members.find(
    (m) => (cleanEmail && m.email === cleanEmail) || (userId && m.user && String(m.user) === String(userId))
  );
  if (clash) throw badRequest(`${clash.name} is already in this group.`);

  const linked = await findAccount({ email: cleanEmail, userId });
  const cleanName = String(name || '').trim() || linked?.name || '';
  if (!cleanName) throw badRequest('Please give the roommate a name.');

  group.members.push({
    user: linked?._id || null,
    name: cleanName.slice(0, 80),
    email: linked?.email || cleanEmail,
    addedAt: new Date(),
  });
  await group.save();

  return toPublicGroup(group, user);
}

/**
 * Move somebody between roles. Admin only, and two rows are untouchable: the
 * owner (an admin by construction) and a member who has not signed up yet - a
 * role with no account behind it would quietly stop applying the moment the
 * link is filled in, so it is refused with a sentence that says why.
 */
export async function setMemberRole(user, groupId, { memberIndex: at, role } = {}) {
  const group = await loadAdminGroup(user, groupId, 'manage');
  const index = memberIndex(at);
  if (index === null || index >= group.members.length) {
    throw badRequest('Choose somebody from this group.');
  }
  if (index === 0) {
    throw badRequest('The owner is an admin by definition, and cannot be given another role.');
  }
  if (!ROLES_ASSIGNABLE.includes(role)) {
    throw badRequest('That is not one of the four group roles.');
  }
  const member = group.members[index];
  if (!member.user) {
    throw badRequest(
      `${member.name} has not signed up yet, so a role would not stick. It fills in itself the moment they register — give them a role after that.`
    );
  }
  member.role = role;
  await group.save();
  return toPublicGroup(group, user);
}

/**
 * Raise a flag on a bill (GRP-1, the auditor's one power over a record they may
 * not change). A flag is a question, not an edit: the row is untouched, and the
 * reason is what makes it useful.
 */
export async function flagExpense(user, groupId, expenseId, { reason } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'flag');
  const note = String(reason || '').trim();
  if (note.length < 3) throw badRequest('Say what looks wrong, in a few words.');
  if (note.length > 200) throw badRequest('A flag can be at most 200 characters long.');
  const expense = await GroupExpense.findOne({ _id: expenseId, group: group._id });
  if (!expense) throw notFound();
  expense.flag = {
    by: user._id,
    byName: group.members[group.members.findIndex((m) => m.user && String(m.user) === String(user._id))]?.name || '',
    reason: note,
    at: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  };
  await expense.save();
  return toPublicExpense(expense, group);
}

/** Clear a flag once the treasurer or the owner has looked at it. */
export async function clearExpenseFlag(user, groupId, expenseId, { note } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'addBill');
  const expense = await GroupExpense.findOne({ _id: expenseId, group: group._id });
  if (!expense) throw notFound();
  expense.flag = {
    ...(expense.flag ? expense.flag.toObject?.() ?? expense.flag : {}),
    resolvedAt: new Date(),
    resolvedBy: user._id,
    resolution: String(note || '').trim().slice(0, 200),
  };
  await expense.save();
  return toPublicExpense(expense, group);
}
export async function updateGroup(user, groupId, { name, archived } = {}) {
  const group = await loadAdminGroup(user, groupId, 'manage');

  if (name !== undefined) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw badRequest('Please give the group a name.');
    if (cleanName.length > 60) throw badRequest('A group name can be at most 60 characters long.');
    group.name = cleanName;
  }
  if (archived !== undefined) group.archived = Boolean(archived);

  await group.save();
  return toPublicGroup(group, user);
}

/**
 * The only hard delete in the app, and it is the owner's: a group is shared
 * with other people, so "close it" (archived) is the usual way out and a real
 * delete has to be asked for on purpose. The bills and settlements go with it.
 */
export async function deleteGroup(user, groupId) {
  const group = await loadAdminGroup(user, groupId, 'manage');
  await Promise.all([
    GroupExpense.deleteMany({ group: group._id }),
    GroupSettlement.deleteMany({ group: group._id }),
  ]);
  await Group.deleteOne({ _id: group._id, owner: user._id });
  return true;
}

/**
 * Add a shared bill. The client sends what it wants, never how to split it:
 * the split is validated and re-computed here, then stored, so a tampered
 * payload cannot put a bill's shares out of balance.
 */
export async function addExpense(user, groupId, payload = {}) {
  const group = await loadGroupFor(user, groupId);
  // logging money is a treasurer's job, not a right of membership
  requireCapability(group, user, 'addBill');

  const title = String(payload.title || '').trim();
  if (!title) throw badRequest('Please give the bill a short name, e.g. "Mess bill".');
  if (title.length > 80) throw badRequest('A bill name can be at most 80 characters long.');
  if (!isPositiveAmount(payload.amount)) {
    throw badRequest('Amount must be more than 0 with at most 2 decimals.');
  }

  const totalCents = toCents(payload.amount);
  const paidByIndex = memberIndex(payload.paidByIndex);
  if (paidByIndex === null || paidByIndex >= group.members.length) {
    throw badRequest('Please choose who paid this bill.');
  }

  const splitType = ['equal', 'shares', 'exact'].includes(payload.splitType) ? payload.splitType : 'equal';

  // Who is in this bill. Absent means everybody, so every client written before
  // this existed — and every bill already stored — keeps its meaning.
  const included = includedPositions(group, payload.includedIndexes);
  if (!included.includes(paidByIndex)) {
    throw badRequest(
      `${group.members[paidByIndex].name} paid this bill, so they have to be one of the people it is split between.`
    );
  }

  const { split, shares } = resolveSplit(splitType, totalCents, included, payload.shares);

  const date = startOfDay(payload.date);
  if (!date) throw badRequest('Please pick a valid date for the bill.');

  const category = await usableCategory(user, payload.categoryId);
  const note = String(payload.note || '').trim().slice(0, 200);

  const expense = await GroupExpense.create({
    group: group._id,
    title: title.slice(0, 80),
    amount: toDec(payload.amount),
    paidByIndex,
    splitType,
    shares,
    split: split.map((line) => ({ memberIndex: line.memberIndex, amount: toDec(line.cents / 100) })),
    includedIndexes: included,
    category: category ? category._id : null,
    date,
    note,
    createdBy: user._id,
  });
  if (expense.category) await expense.populate('category', 'name icon');

  return { expense: toPublicExpense(expense, group), balances: await balancesFor(group) };
}

/**
 * "Settle up": record that one person handed money to another. Any member can
 * do it (roommates settle in the kitchen, not in a specific account), and the
 * pair is checked against the live balances so a group can never settle more
 * than it owes.
 */
export async function settleUp(user, groupId, { fromIndex, toIndex, amount, note } = {}) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'addBill');

  const from = memberIndex(fromIndex);
  const to = memberIndex(toIndex);
  if (from === null || to === null || from >= group.members.length || to >= group.members.length) {
    throw badRequest('Choose two people from this group.');
  }
  if (from === to) throw badRequest('A settlement needs two different people.');
  if (!isPositiveAmount(amount)) throw badRequest('Enter an amount more than 0.');

  const cents = toCents(amount);
  const { rows, centsByIndex } = await computeBalances(group);

  const owesCents = -centsByIndex[from]; // how much the payer still owes
  const owedCents = centsByIndex[to]; // how much is still owed to the receiver
  const owesName = group.members[from].name;
  const owedName = group.members[to].name;

  if (owesCents <= 0) {
    throw badRequest(`${owesName} does not owe anything right now.`);
  }
  if (owedCents <= 0) {
    throw badRequest(`${owedName} is not owed anything, so there is nothing to settle.`);
  }
  if (cents > owesCents) {
    throw badRequest(
      `${owesName} only owes ${formatMoney(owesCents / 100)} in total — settle that much or less.`
    );
  }
  if (cents > owedCents) {
    throw badRequest(`${owedName} is only owed ${formatMoney(owedCents / 100)} from this group.`);
  }

  const settlement = await GroupSettlement.create({
    group: group._id,
    fromIndex: from,
    toIndex: to,
    amount: toDec(amount),
    note: String(note || '').trim().slice(0, 200),
    by: user._id,
    date: new Date(),
  });

  // the board is read back AFTER the write, so the screen sees the settled
  // numbers and not the state from a moment ago
  return { settlement: toPublicSettlement(settlement, group), balances: (await computeBalances(group)).rows };
}

/* ------------------------------- the balances ------------------------------ */

/**
 * Net owed / net owing per member, built from four aggregation pipelines (all
 * of them $match + $group + $sum over the group):
 *   paid       — bills each member fronted
 *   share      — their resolved share of every bill ($unwind of `split`)
 *   settledIn  — settlements pointing at them
 *   settledOut — settlements they made
 * Settling in gives up a claim and settling out clears a debt, so
 * net = paid − share − settledIn + settledOut: a positive number is money the
 * group owes this member, a negative one is money they owe the group. The
 * board always sums to zero — that is the whole point of the module.
 */
async function computeBalances(group) {
  const id = group._id;
  const [paidRows, shareRows, inRows, outRows] = await Promise.all([
    GroupExpense.aggregate([
      { $match: { group: id } },
      { $group: { _id: '$paidByIndex', paid: { $sum: '$amount' } } },
    ]),
    GroupExpense.aggregate([
      { $match: { group: id } },
      { $unwind: '$split' },
      { $group: { _id: '$split.memberIndex', share: { $sum: '$split.amount' } } },
    ]),
    GroupSettlement.aggregate([
      { $match: { group: id } },
      { $group: { _id: '$toIndex', total: { $sum: '$amount' } } },
    ]),
    GroupSettlement.aggregate([
      { $match: { group: id } },
      { $group: { _id: '$fromIndex', total: { $sum: '$amount' } } },
    ]),
  ]);

  const paid = centsMap(paidRows, 'paid');
  const share = centsMap(shareRows, 'share');
  const settledIn = centsMap(inRows, 'total');
  const settledOut = centsMap(outRows, 'total');

  const centsByIndex = [];
  const rows = group.members.map((member, index) => {
    const p = paid.get(index) || 0;
    const s = share.get(index) || 0;
    const sin = settledIn.get(index) || 0;
    const sout = settledOut.get(index) || 0;
    const net = p - s - sin + sout;
    centsByIndex[index] = net;
    return {
      memberIndex: index,
      name: member.name,
      paid: p / 100,
      share: s / 100,
      settledIn: sin / 100,
      settledOut: sout / 100,
      net: net / 100,
    };
  });

  return { rows, centsByIndex };
}

async function balancesFor(group) {
  const { rows } = await computeBalances(group);
  return rows;
}

/* -------------------------------- the split -------------------------------- */

/**
 * Who a bill is split between, as sorted, de-duplicated member positions.
 *
 * The list is ABSENT → everybody. That is not a default for convenience: it is
 * the meaning of every bill stored before this feature and of every client that
 * has not heard of it, so an old caller and an old row keep working untouched.
 * Anything that IS sent is checked properly — a list of whole numbers, not
 * empty, no duplicates, and every one of them a real seat in this group — and
 * then sorted, because a split of "the ticked people" must not depend on the
 * order the browser happened to tick them in.
 */
function includedPositions(group, raw) {
  const everyone = group.members.map((_, index) => index);
  if (raw === undefined || raw === null) return everyone;

  if (!Array.isArray(raw)) {
    throw badRequest('Tick the people this bill is split between — the ticked list has to be whole numbers.');
  }
  if (raw.length === 0) throw badRequest('Tick at least one person for this bill.');

  const picked = [];
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw badRequest('Tick the people this bill is split between — the ticked list has to be whole numbers.');
    }
    if (value < 0 || value >= group.members.length) {
      throw badRequest('One of the ticked people is not in this group.');
    }
    if (picked.includes(value)) throw badRequest('Each person can only be ticked once for a bill.');
    picked.push(value);
  }
  return picked.sort((a, b) => a - b);
}

/**
 * Turn a request into whole cents. Returns both halves of the answer: the
 * stored `shares` (what was asked for) and the stored `split` (what each
 * person actually pays).
 *
 * `positions` is the list of REAL member positions this bill covers, and every
 * line that comes back carries the position it belongs to. The maths itself did
 * not change: it still works over a short list of weights, so a bill between
 * three of five people is the same calculation as a bill between everyone —
 * and somebody who was not ticked simply has no line, which is exactly how the
 * balance board leaves them out (it sums `split`, nothing else).
 */
function resolveSplit(splitType, totalCents, positions, rawShares) {
  if (splitType === 'exact') {
    const cents = exactCents(totalCents, positions, rawShares);
    return {
      split: cents.map((value, seat) => ({ memberIndex: positions[seat], cents: value })),
      shares: cents
        .map((value, seat) => ({ memberIndex: positions[seat], value: value / 100 }))
        .filter((row) => row.value > 0),
    };
  }

  const weights =
    splitType === 'shares' ? shareWeights(positions, rawShares) : new Array(positions.length).fill(1);
  const cents = distributeCents(totalCents, weights);

  return {
    split: cents.map((value, seat) => ({ memberIndex: positions[seat], cents: value })),
    shares:
      splitType === 'shares'
        ? weights
            .map((value, seat) => ({ memberIndex: positions[seat], value }))
            .filter((row) => row.value > 0)
        : [],
  };
}

/**
 * THE REMAINDER RULE, in one place: every member's cut is floored to a whole
 * cent, and the cents that will not divide evenly go to the members whose cut
 * lost the most to that floor — biggest cut-off fraction first, earlier member
 * first on a tie. With equal weights every fraction is the same, so the odd
 * cent always lands on the first member (index 0, the owner).
 *
 * It takes a list of WEIGHTS, never a member count, which is what lets a subset
 * split reuse this rule unchanged instead of growing a second copy of it: a
 * three-of-five bill is the same call with three weights instead of five. The
 * weights arrive in member order (`includedPositions` sorts them), so "earlier
 * member first" still means the same thing when only a few people are in.
 */
function distributeCents(totalCents, weights) {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(weightSum > 0)) throw badRequest('Give the split some weight to work with.');

  const raw = weights.map((weight) => (totalCents * weight) / weightSum);
  const cents = raw.map((value) => Math.floor(value));
  const order = raw
    .map((value, index) => index)
    .sort((a, b) => raw[b] - cents[b] - (raw[a] - cents[a]) || a - b);

  let leftover = totalCents - cents.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < leftover; i += 1) cents[order[i]] += 1;

  return cents;
}

/** Weights are laid out over the people who are IN the bill, and only those. */
function shareWeights(positions, rawShares) {
  const rows = Array.isArray(rawShares) ? rawShares : [];
  if (rows.length === 0) {
    throw badRequest('Give each person a share — 1 is a normal share, 2 is double.');
  }

  const weights = new Array(positions.length).fill(0);
  for (const row of rows) {
    const index = memberIndex(row?.memberIndex);
    // A share line for somebody who was not ticked is an error, never a silent
    // drop: the owner would see a bill split among three people while the
    // numbers quietly came from four.
    if (index === null || !positions.includes(index)) {
      throw badRequest('One of the share lines points at somebody who is not in this bill.');
    }
    const seat = positions.indexOf(index);
    if (weights[seat] > 0) throw badRequest('Each person can only appear once in the split.');

    const value = Number(row?.value);
    if (!Number.isFinite(value) || value <= 0) {
      throw badRequest('Shares must be more than 0 — use 1 for a normal share.');
    }
    weights[seat] = value;
  }
  return weights;
}

/** 'exact' is the one split the client is allowed to spell out in money. */
function exactCents(totalCents, positions, rawShares) {
  const rows = Array.isArray(rawShares) ? rawShares : [];
  if (rows.length === 0) throw badRequest('Enter an amount for each person.');

  const cents = new Array(positions.length).fill(0);
  const seen = new Set();
  for (const row of rows) {
    const index = memberIndex(row?.memberIndex);
    if (index === null || !positions.includes(index)) {
      throw badRequest('One of the split lines points at somebody who is not in this bill.');
    }
    if (seen.has(index)) throw badRequest('Each person can only appear once in the split.');
    seen.add(index);

    const value = parseAmount(row?.value);
    if (value === null) {
      throw badRequest('Every exact amount must be 0 or more with at most 2 decimals.');
    }
    cents[positions.indexOf(index)] = value;
  }

  const sum = cents.reduce((a, b) => a + b, 0);
  if (sum !== totalCents) {
    throw badRequest(
      `Those amounts add up to ${formatMoney(sum / 100)}, but the bill is ${formatMoney(totalCents / 100)}.`
    );
  }
  return cents;
}

/* ---------------------------------- roles ---------------------------------- */

/**
 * What each role may do, in one table. `rank` only orders the roles for the
 * dropdown; the permission is the list, never the number.
 *
 * view       read the group: its members, its bills, its balances, and the
 *            ledger pages (journal, trial balance, reconciliation)
 * addBill    log a shared bill and settle up between members
 * postJournal write to the group books
 * reconcile  run a bank reconciliation
 * flag       raise and clear a flag on a bill or a journal entry
 * manage     add a roommate, rename, archive, delete the group, set roles
 */
export const GROUP_ROLES = [
  { key: 'admin', rank: 4, can: ['view', 'addBill', 'postJournal', 'reconcile', 'flag', 'manage'] },
  { key: 'treasurer', rank: 3, can: ['view', 'addBill', 'postJournal', 'reconcile', 'flag'] },
  { key: 'auditor', rank: 2, can: ['view', 'flag'] },
  { key: 'member', rank: 1, can: ['view'] },
];

const CAPABILITIES = new Map(GROUP_ROLES.map((role) => [role.key, new Set(role.can)]));
const ROLES_ASSIGNABLE = GROUP_ROLES.map((role) => role.key);

/**
 * The role of one person in one group.
 *
 * Position 0 is the owner and is an admin BY CONSTRUCTION, whatever the stored
 * row says: there has to be one person who can always fix the roles. A member
 * row with no role - a group written before roles existed - reads as `member`,
 * which is the least power in the table.
 */
export function roleOf(group, memberIndex) {
  if (memberIndex === 0 || String(group.owner) === String(group.members?.[memberIndex]?.user || '')) {
    return 'admin';
  }
  const stored = group.members?.[memberIndex]?.role;
  return CAPABILITIES.has(stored) ? stored : 'member';
}

/** The role the signed-in person holds in this group, or null if not a member. */
export function roleForUser(group, user) {
  const index = group.members.findIndex((member) => member.user && String(member.user) === String(user._id));
  if (index < 0) return String(group.owner) === String(user._id) ? 'admin' : null;
  return roleOf(group, index);
}

/** The capability set of a role, as the client reads it. */
export function capabilitiesForRole(role, index = -1) {
  const known = CAPABILITIES.has(role) ? role : 'member';
  const can = {};
  for (const key of ['view', 'addBill', 'postJournal', 'reconcile', 'flag', 'manage']) {
    can[key] = CAPABILITIES.get(known).has(key);
  }
  return {
    role: known,
    rank: GROUP_ROLES.find((row) => row.key === known).rank,
    can,
    index,
  };
}

/**
 * Everything the client needs to render this person's powers, and everything the
 * server needs to check them, from the same source.
 */
export function capabilitiesFor(group, user) {
  const index = group.members.findIndex(
    (member) => member.user && String(member.user) === String(user._id)
  );
  return capabilitiesForRole(roleForUser(group, user) || 'member', index);
}

/**
 * The gate. A readable sentence, because "forbidden" with no reason is a
 * support ticket waiting to happen - the person is told what their role is and
 * what to ask for.
 */
export function requireCapability(group, user, capability) {
  const { role, can } = capabilitiesFor(group, user);
  if (can[capability]) return capabilitiesFor(group, user);
  const asks = {
    manage: 'ask the group owner to change your role',
    addBill: 'ask the group owner or the treasurer to add entries',
    postJournal: 'ask the group owner or the treasurer to post journal entries',
    reconcile: 'ask the group owner or the treasurer to run the reconciliation',
    flag: 'ask the group owner to make you an auditor or a treasurer',
  };
  throw forbidden(
    `You are a ${role} in this group, and that cannot ${capability.replace('postJournal', 'post journal entries')}. ${asks[capability] || 'Ask the group owner for access.'}`
  );
}

/** The roles a member can be moved to, for the dropdown. */
export function assignableRoles() {
  return ROLES_ASSIGNABLE;
}

/* -------------------------------- membership ------------------------------- */

/**
 * The only group read that exists: yours, or a group you are a member of.
 * Exported so the chat service (GRP-4) asks the same question through the same
 * query, rather than growing a second definition of "a group you may see" that
 * could drift away from this one.
 */
export async function loadGroupFor(user, groupId) {
  if (!mongoose.isValidObjectId(groupId)) throw notFound();
  const group = await Group.findOne({
    _id: groupId,
    $or: [{ owner: user._id }, { 'members.user': user._id }],
  });
  if (!group) throw notFound();
  return group;
}

/**
 * A group you are allowed to change the settings of. The owner's row is an
 * admin by construction, so this is "manage", not "is the owner" - which is what
 * lets a co-admin do the work and keeps the owner un-demotable.
 */
async function loadAdminGroup(user, groupId, capability = 'manage') {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, capability);
  return group;
}

/**
 * Turn the invited list into member rows. One lookup for every address at
 * once, so a group of six is a single query, not six.
 */
async function resolvePeople(invited, owner) {
  const clean = [];
  const seen = new Set([String(owner.email || '').toLowerCase()].filter(Boolean));

  for (const raw of invited) {
    const email = String(raw?.email || '').trim().toLowerCase();
    if (email && seen.has(email)) {
      throw badRequest(`${email} is already in this group.`);
    }
    if (email) seen.add(email);
    clean.push({ email, name: String(raw?.name || '').trim() });
  }

  const accounts = await User.find({ email: { $in: clean.map((row) => row.email).filter(Boolean) } })
    .select('_id name email')
    .lean();
  const byEmail = new Map(accounts.map((account) => [account.email, account]));

  return clean.map((row) => {
    const account = byEmail.get(row.email);
    const name = row.name || account?.name || '';
    if (!name) {
      throw badRequest('Every roommate needs a name — an email address we recognise is enough.');
    }
    return {
      user: account ? account._id : null,
      name: name.slice(0, 80),
      email: account?.email || row.email,
      addedAt: new Date(),
    };
  });
}

/** Link a roommate to their account by id, or failing that by email. */
async function findAccount({ email, userId }) {
  if (userId) {
    if (!mongoose.isValidObjectId(userId)) throw badRequest('That account does not exist.');
    const byId = await User.findById(userId).select('_id name email').lean();
    if (!byId) throw badRequest('That account does not exist.');
    return byId;
  }
  if (!email) return null;
  return User.findOne({ email }).select('_id name email').lean();
}

/** A bill's category has to be one the payer could pick on their own entry. */
async function usableCategory(user, categoryId) {
  if (!categoryId) return null;
  if (!mongoose.isValidObjectId(categoryId)) throw badRequest('That category does not exist.');
  const category = await Category.findOne({
    _id: categoryId,
    $or: [{ user: user._id }, { user: null, isDefault: true }],
    type: 'expense',
    isActive: true,
  });
  if (!category) throw badRequest('That category does not exist.');
  return category;
}

/* ------------------------------- public shapes ----------------------------- */

function toPublicGroup(group, user) {
  return {
    id: group._id.toString(),
    name: group.name,
    currency: group.currency,
    archived: Boolean(group.archived),
    isOwner: String(group.owner) === String(user._id),
    memberCount: group.members.length,
    createdAt: group.createdAt ? new Date(group.createdAt).toISOString() : null,
    // what THIS person may do here, so the client never has to guess
    viewer: capabilitiesFor(group, user),
  };
}

function toPublicMember(member, index, group) {
  // NEW-1: a member who closed their account. The row stays (the books have to
  // stay auditable) but the name is a sentinel, and the client turns this marker
  // into `del.formerMember` rather than printing the sentinel. Computed from the
  // row rather than stored, so it is right for a group that predates the deletion
  // feature as well as one written after it.
  const gone = isFormerMember(member);

  return {
    index,
    user: member.user ? member.user.toString() : null,
    // empty when the person is gone, with the flag beside it: the client
    // shows del.formerMember, and a blank name is never better than the
    // sentinel it replaced
    name: gone ? '' : member.name,
    isFormerMember: gone,
    email: member.email || '',
    addedAt: member.addedAt ? new Date(member.addedAt).toISOString() : null,
    // position 0 is the owner by construction — see models/Group.js
    isOwner: index === 0,
    role: roleOf(group, index),
  };
}

function toPublicExpense(expense, group) {
  return {
    id: expense._id.toString(),
    title: expense.title,
    amount: toNum(expense.amount),
    paidByIndex: expense.paidByIndex,
    paidByName: group.members[expense.paidByIndex]?.name || '',
    splitType: expense.splitType,
    shares: (expense.shares || []).map((row) => ({ memberIndex: row.memberIndex, value: row.value })),
    split: (expense.split || []).map((row) => ({
      memberIndex: row.memberIndex,
      amount: toNum(row.amount),
    })),
    includedIndexes: includedOn(expense, group),
    category: publicCategory(expense.category),
    date: new Date(expense.date).toISOString(),
    note: expense.note || '',
    createdBy: expense.createdBy ? expense.createdBy.toString() : null,
    flag: expense.flag
      ? {
          by: expense.flag.by ? expense.flag.by.toString() : null,
          byName: expense.flag.byName || '',
          reason: expense.flag.reason,
          at: expense.flag.at ? new Date(expense.flag.at).toISOString() : null,
          resolvedAt: expense.flag.resolvedAt ? new Date(expense.flag.resolvedAt).toISOString() : null,
          resolvedBy: expense.flag.resolvedBy ? expense.flag.resolvedBy.toString() : null,
          resolution: expense.flag.resolution || '',
          open: !expense.flag.resolvedAt,
        }
      : null,
  };
}

/**
 * Who a bill was split between, as the client will read it.
 *
 * A bill written BEFORE this feature has no `includedIndexes` at all: the field
 * did not exist, so that bill was split between everybody, and that is the only
 * thing it can have meant — reading it back as the full member list is
 * therefore reading it truthfully, not guessing. Nothing is recomputed from the
 * set either way: `split` stays the answer of record, so an old bill's money
 * cannot move and the balance board is identical before and after this field
 * was added.
 */
function includedOn(expense, group) {
  const stored = expense.includedIndexes;
  if (!Array.isArray(stored) || stored.length === 0) {
    return group.members.map((_, index) => index);
  }
  return stored.map(Number).sort((a, b) => a - b);
}

/** A bill's category, whether it came back populated or as a bare id. */
function publicCategory(category) {
  if (!category) return null;
  const id = category._id || category;
  if (!id) return null;
  return { id: String(id), name: category.name || '', icon: category.icon || '' };
}

function toPublicSettlement(settlement, group) {
  return {
    id: settlement._id.toString(),
    fromIndex: settlement.fromIndex,
    fromName: group.members[settlement.fromIndex]?.name || '',
    toIndex: settlement.toIndex,
    toName: group.members[settlement.toIndex]?.name || '',
    amount: toNum(settlement.amount),
    note: settlement.note || '',
    by: settlement.by ? settlement.by.toString() : null,
    date: new Date(settlement.date).toISOString(),
  };
}

/* --------------------------------- helpers --------------------------------- */

/** Whole cents, so no split decision is ever made on a float. */
function toCents(value) {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === 'object' && value.$numberDecimal !== undefined ? value.$numberDecimal : value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** "12.5" -> 1250, "0" -> 0, anything else -> null. */
function parseAmount(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

/** Client positions arrive as strings from a <select> — "2" must mean 2. */
function memberIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function currencyCode(value) {
  if (value === undefined || value === null || value === '') return 'USD';
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw badRequest('A currency is a three-letter code, e.g. USD.');
  return code;
}

function centsMap(rows, field) {
  const map = new Map();
  for (const row of rows) map.set(Number(row._id), toCents(row[field]));
  return map;
}

function latest(...dates) {
  const times = dates.filter(Boolean).map((date) => new Date(date).getTime()).filter(Number.isFinite);
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/**
 * Calendar days are stored at UTC midnight, exactly as the transaction ledger
 * does it: the reader slices the ISO string, so anything else would shift the
 * day for half the world's time zones.
 */
function startOfDay(value) {
  if (value === undefined || value === null || value === '') return new Date();
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  const date = day ? new Date(`${day[0].slice(0, 10)}T00:00:00.000Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

function notFound() {
  const err = new Error('Group not found.');
  err.status = 404;
  return err;
}
