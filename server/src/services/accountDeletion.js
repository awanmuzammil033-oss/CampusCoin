import crypto from 'node:crypto';
import fs from 'node:fs';

import User from '../models/User.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import TransactionHistory from '../models/TransactionHistory.js';
import Category from '../models/Category.js';
import CategoryCorrection from '../models/CategoryCorrection.js';
import Budget from '../models/Budget.js';
import WishItem from '../models/WishItem.js';
import JarMovement from '../models/JarMovement.js';
import RecurringRule from '../models/RecurringRule.js';
import Wallet from '../models/Wallet.js';
import WalletTransfer from '../models/WalletTransfer.js';
import Notification from '../models/Notification.js';
import Insight from '../models/Insight.js';
import UserTip from '../models/UserTip.js';
import RecentActivity from '../models/RecentActivity.js';
import DataExport from '../models/DataExport.js';

import { hashPassword, verifyPassword } from './accounts.js';

/**
 * Delete account, with a seven-day grace period (NEW-1).
 *
 * WHY THE SUBDOCUMENT ON THE USER AND NOT A COLLECTION
 * ---------------------------------------------------
 * There is no AccountDeletion model for this feature, and that is a decision
 * rather than an omission. A request to delete is not a record anybody queries:
 * there is at most ONE per account, it is only ever read together with the
 * account it belongs to, and its whole meaning is "what is the state of this
 * person's three fields" - a state machine with three states, not a list. A
 * collection would need a unique index on `user` to be correct, and every read
 * would have to join it back to the account to answer the only question anyone
 * asks ("is mine pending?"). It is already on `User.deletion` (with the comment
 * that says why `scheduledFor` is stored rather than derived), so putting a
 * second copy of the same three fields in another collection would be two
 * sources of truth for one fact.
 *
 * THE CLOCK IS WRITTEN ONCE
 * -------------------------
 * `requestedAt` and `scheduledFor` are written by the FIRST request and are
 * never touched again. A student who asks, changes their mind, and asks again
 * does not get a fresh seven days - otherwise the clock could be restarted
 * forever and the grace period would not be one. The second request says so in
 * the response instead of pretending to start again.
 *
 * THE ACCOUNT ROW STAYS, AND THAT IS THE POINT
 * ---------------------------------------------
 * Deleting the row would break the audit trail every other feature in this app
 * stands on: the group books point at who posted a bill, who settled, who
 * raised a flag, and who created a journal entry. So the row is ANONYMISED and
 * deactivated, not dropped:
 *
 *   - `name`          -> the same FORMER_MEMBER_KEY the group rows carry
 *   - `email`         -> a unique, unrouteable address built from the account id
 *   - `recoveryEmail` -> the same, on the reserved RFC 2606 `.invalid` domain
 *   - `passwordHash`  -> a hash of 32 random bytes nobody has, so no password
 *                        can ever match it
 *   - `resetCodeHash` -> dropped with its expiry and attempt count
 *   - `guardian`      -> the whole subdocument unset: it is somebody ELSE's
 *                        address, and it was consented to by a person who no
 *                        longer exists
 *   - `isActive`      -> false, which signs the account out everywhere at once
 *   - `deletion.formerName`  -> the old display name, kept on purpose
 *   - `deletion.anonymisedAt`-> set by this work, never by the request
 *
 * `deletion.formerName` is the one piece of personal data that stays, and it
 * stays because the group member rows need something to point at: an audit
 * trail that says "one of the twelve people in this mess fund deleted their
 * account" is still auditable, and one that names them is not.
 *
 * THE GROUP BOOKS SURVIVE, AND THIS IS THE CRUX
 * ---------------------------------------------
 * A person who was in a hostel mess fund must still be in it afterwards, as a
 * "Former member". The group's accounting has to stay auditable and the OTHER
 * members' balances must not move by a cent, so:
 *
 *   - the member ROW is kept (its position in `members` is the index every bill,
 *     settlement and journal line keys off - removing it would renumber the
 *     whole group and rewrite history);
 *   - the identifying fields ON that row are blanked or replaced: the account
 *     link, the display name and the email address;
 *   - `groupexpenses`, `groupsettlements`, `groupjournalentries`,
 *     `groupaccounts`, `groupreconciles` and `groupmessages` are NOT TOUCHED AT
 *     ALL. Not an amount, not a split line, not a settlement counterparty, not
 *     a chat message, not a flag. A settlement they were the counterparty of
 *     STAYS, because a settlement with a missing half is worse than a settlement
 *     with an anonymised one.
 *
 * `tests/accountDeletion.test.js` asserts exactly that: the whole balance
 * board, every member's row, deep-equal before and after.
 *
 * "Former member" IS A DICTIONARY KEY, NOT A STRING
 * ------------------------------------------------
 * What is stored is the constant FORMER_MEMBER_KEY below, which is not a
 * sentence and is not English prose - it is the same rule the group's poll
 * cards follow (a category is stored as a key and the client writes the words).
 * The group screens should render `t('del.formerMember')` for a member row
 * whose name is that key; `isFormerMember()` below is the one-line check, and
 * services/groups.js is not this feature's file to change.
 */
export const GRACE_DAYS = 7;

/**
 * What a departed member's row says instead of a name. A KEY, like
 * `GroupMessage.poll.category`: the stored value is never shown raw, and the
 * wording is the dictionary's job in all fourteen languages.
 */
// the sentinel itself lives in a module with no imports, because services/groups.js
// needs it and must not drag this module - and therefore config/env.js - in behind
// it. Re-exported here so everything that already imported it from this file keeps
// working, and so there is still exactly one definition of the string.
// The sentinel lives in a module with no imports, because services/groups.js needs
// it and must not drag this module - and therefore config/env.js, which reads
// MONGODB_URI once at load time - in behind it. See constants/formerMember.js.
//
// IMPORTED as well as re-exported, and that is the part that is easy to get
// wrong: a bare `export { X } from './m.js'` publishes X without binding it here,
// so the two places below that WRITE the sentinel were referring to nothing.
// Still one definition - it is in the neutral module, this is a use of it.
import { FORMER_MEMBER_KEY, isFormerMember } from '../constants/formerMember.js';
export { FORMER_MEMBER_KEY, isFormerMember };


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

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

/** The whole subdocument, in the shape the card reads it. */
export function deletionState(user) {
  const d = user?.deletion;
  if (!d?.requestedAt) return { pending: false, anonymised: Boolean(d?.anonymisedAt) };
  const scheduledFor = d.scheduledFor || d.requestedAt;
  return {
    pending: true,
    requestedAt: d.requestedAt,
    scheduledFor,
    daysLeft: Math.max(0, Math.ceil((new Date(scheduledFor) - new Date()) / 86400000)),
    reason: d.reason || '',
    anonymised: Boolean(d.anonymisedAt),
  };
}

/* --------------------------------- the request ------------------------------ */

/**
 * Ask to leave, after re-typing the password.
 *
 * Two sentences, and neither of them says anything about whether the account
 * exists - the guard in the router has already established that it does and
 * belongs to the caller, so the only thing the password can be wrong about is
 * the password. An empty box is a different mistake from a wrong one and is
 * named as such, because "that password is not right" for a field nobody typed
 * in is a small lie about what happened.
 */
export async function requestDeletion(user, { password, reason } = {}) {
  if (user.deletion?.anonymisedAt) {
    throw conflict('This account has already been closed.');
  }
  if (user.deletion?.requestedAt) {
    // Deliberately does NOT touch scheduledFor. See the note at the top. The
    // sentence says the clock is not restarted, because that is the thing the
    // person is actually about to get wrong - and it says nothing about where
    // the button to cancel is, which is the screen's business and not ours.
    throw conflict('A deletion is already scheduled for this account, and asking again does not move the date.');
  }

  const typed = String(password ?? '');
  if (!typed) throw badRequest('Type your password to confirm this is your account.');

  const full = await User.findById(user._id).select('+passwordHash');
  if (!full || !(await verifyPassword(typed, full.passwordHash))) {
    throw badRequest('That password is not right.');
  }

  const now = new Date();
  // Exactly seven days from the moment of the request. The UTC-midnight rule in
  // this app is for CALENDAR dates - a transaction day, a budget month - where
  // a day is a thing to be agreed on. A grace period is a countdown, and
  // rounding it to midnight would hand a student who asked at six in the
  // evening less than the seven days they were promised.
  const scheduledFor = new Date(now.getTime() + GRACE_DAYS * 86400000);

  full.deletion = {
    requestedAt: now,
    scheduledFor,
    reason: String(reason || '').trim().slice(0, 300),
    anonymisedAt: null,
    formerName: '',
  };
  await full.save();
  return deletionState(full);
}

/**
 * Take it back, any time before the date. The whole subdocument goes, so the
 * account is in exactly the state it was in before the request - there is
 * nothing left behind to half-apply a second time.
 */
export async function cancelDeletion(user) {
  if (user.deletion?.anonymisedAt) {
    throw conflict('This account has already been closed.');
  }
  if (!user.deletion?.requestedAt) {
    throw badRequest('There is no scheduled deletion on this account to cancel.');
  }
  if (new Date(user.deletion.scheduledFor || 0) <= new Date()) {
    throw conflict('The grace period is over, so this deletion can no longer be cancelled.');
  }

  const full = await User.findById(user._id);
  full.deletion = undefined;
  await full.save();
  return deletionState(full);
}

/* --------------------------------- the work --------------------------------- */

/**
 * Everything of this person that has no claim to survive.
 *
 * The list is exhaustive on purpose: a deletion that removes the transactions
 * and forgets the audit rows, or the jar movements behind the savings balance,
 * leaves the personal data sitting in a collection nobody ever looks at. The
 * GROUP collections are not on this list, and their absence is the decision
 * documented at the top of the file.
 */
const PERSONAL_MODELS = [
  ['transactions', Transaction],
  ['transaction history', TransactionHistory],
  ['personal categories', Category],
  ['category corrections', CategoryCorrection],
  ['budgets', Budget],
  ['wish items', WishItem],
  ['jar movements', JarMovement],
  ['recurring rules', RecurringRule],
  ['wallets', Wallet],
  ['wallet transfers', WalletTransfer],
  ['notifications', Notification],
  ['insights', Insight],
  ['tips seen', UserTip],
  ['recent activity', RecentActivity],
];

/**
 * The archives too, not just their rows. A finished export is a ZIP of this
 * person's whole ledger sitting in the temp folder; leaving it there for its
 * 24 hours after they asked to be forgotten would make the grace period a lie.
 */
async function removeExports(userId) {
  const jobs = await DataExport.find({ user: userId }).select('+filePath');
  for (const job of jobs) {
    if (job.filePath) await fs.promises.rm(job.filePath, { force: true }).catch(() => {});
  }
  const { deletedCount } = await DataExport.deleteMany({ user: userId });
  return deletedCount;
}

/**
 * The one statement that makes somebody a "Former member".
 *
 * ONE `updateMany` with an array filter, and the filter names the same element
 * on both sides (`'members.user'` picks the group, `row.user` picks the row
 * inside it) - so the same mistake a bare positional `$` would make, matching
 * the group by POSITION instead of by person, cannot happen here. Two members
 * can never share a `members.user` value, so exactly one row per group is
 * touched and no other member is disturbed.
 *
 * `role` drops to `member` because a departed person must not still be a
 * treasurer: their powers are meaningless, and the next owner promoting somebody
 * should not have to remember which treasurer is a ghost.
 *
 * NOTHING ELSE IN THE GROUP DOCUMENT IS NAMED. The expenses, the settlements,
 * the journal, the accounts, the reconciliation and the chat are separate
 * collections and this statement does not mention one of them.
 */
async function markFormerMemberEverywhere(userId) {
  const result = await Group.updateMany(
    { 'members.user': userId },
    {
      $set: {
        'members.$[gone].user': null,
        'members.$[gone].name': FORMER_MEMBER_KEY,
        'members.$[gone].email': '',
        'members.$[gone].role': 'member',
      },
    },
    { arrayFilters: [{ 'gone.user': userId }] }
  );
  return { groups: result.matchedCount || 0, rows: result.modifiedCount || 0 };
}

/** An address that cannot be received and cannot be typed by accident. */
function deadAddress(prefix, userId) {
  return `${prefix}+${String(userId).toLowerCase()}@accounts.removed.invalid`;
}

/**
 * Anonymise one account. Safe to call twice: the second call sees
 * `anonymisedAt` and returns the same report without touching anything, which
 * is what makes the job below re-runnable after a crash.
 */
export async function anonymiseUser(userId, { now = new Date() } = {}) {
  const user = await User.findById(userId).select('+passwordHash +resetCodeHash');
  if (!user) throw notFound('That account does not exist.');
  if (user.deletion?.anonymisedAt) {
    return { alreadyDone: true, userId: String(userId), groups: { groups: 0, rows: 0 }, removed: {} };
  }

  const formerName = user.name;
  const formerEmail = user.email;
  const formerRecovery = user.recoveryEmail;

  // 1. The group books, first: the member row is the only thing that will ever
  //    say this person was here, so it is written before the account stops
  //    being able to name them.
  const groups = await markFormerMemberEverywhere(user._id);

  // 2. Their own records, wholesale.
  const removed = {};
  for (const [label, model] of PERSONAL_MODELS) {
    const result = await model.deleteMany({ user: user._id });
    removed[label] = result.deletedCount || 0;
  }
  removed.exports = await removeExports(user._id);

  // 3. The row itself: kept, deactivated, and unidentifiable.
  user.name = FORMER_MEMBER_KEY;
  user.email = deadAddress('closed', user._id);
  user.recoveryEmail = deadAddress('closed-recovery', user._id);
  // A hash of 32 random bytes: it is a valid bcrypt hash, it satisfies the
  // `required` on the field, and there is no password anywhere that matches it.
  user.passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64'));
  user.resetCodeHash = null;
  user.resetCodeExpires = null;
  user.resetCodeAttempts = 0;
  user.recoveryEmailChosen = false;
  user.academicYear = '';
  user.monthlyAllowanceBaseline = null;
  user.monthlySavingsGoal = null;
  user.jarBalance = 0;
  user.survivalMode = { enabled: false, since: null };
  user.isActive = false;
  user.deletion = {
    requestedAt: user.deletion?.requestedAt || now,
    scheduledFor: user.deletion?.scheduledFor || now,
    // whatever the student typed is theirs, and it is not what the audit trail
    // needs
    reason: '',
    anonymisedAt: now,
    formerName,
  };

  // DELIBERATELY LEFT ALONE, with a reason for each, because "delete the
  // personal data" and "delete everything" are not the same job:
  //
  //  - `referralCode`. It identifies the ACCOUNT, not the person, and the
  //    column is unique. Clearing it would let the next registration be handed
  //    the same code, so a link this person already shared would open somebody
  //    else's account - which is the one thing a referral code must never do.
  //  - `referredBy` / `referredAt`. Somebody else's id and a timestamp; the
  //    person who brought them is not their data to erase.
  //  - `theme`, `fontScale`, `language`, `currency`, `ledgerCurrency`. Display
  //    preferences with defaults of their own, identifying nobody, and the row
  //    is a placeholder for a dead account anyway.
  await user.save();

  // `guardian` is UNSET rather than emptied: it holds somebody else's address
  // and a consent that a person who no longer exists can never withdraw, so
  // leaving an empty object behind would be a promise with nobody to keep it.
  await User.updateOne({ _id: user._id }, { $unset: { guardian: 1 } });

  return {
    alreadyDone: false,
    userId: String(user._id),
    formerName,
    // kept for the record only - never written back out
    formerEmail,
    formerRecovery,
    groups,
    removed,
  };
}

/**
 * THE JOB. Finds every account whose grace period is over and closes it.
 *
 * A plain function on purpose: the tests call it directly, a script can import
 * it, and the router below gives an administrator the same thing through the
 * staff door. Nothing about the deletion depends on which of the three ran it,
 * and re-running it is free.
 */
export async function runDueDeletions({ now = new Date() } = {}) {
  // `$ne: null` on its own would also match an account with NO deletion
  // subdocument at all - MongoDB's `$ne` matches a missing field - so the
  // `$exists`-free belt is an explicit `{ $ne: null, $lte: now }` on the date
  // the request actually wrote. A due account always has both.
  const due = await User.find({
    'deletion.requestedAt': { $ne: null },
    'deletion.scheduledFor': { $ne: null, $lte: now },
    'deletion.anonymisedAt': null,
  }).select('_id');

  const results = [];
  for (const row of due) {
    // One account failing must not stop the others: a job that gives up halfway
    // is worse than one that reports what it could not do.
    results.push(await anonymiseUser(row._id, { now }).catch((err) => ({ userId: String(row._id), error: err.message })));
  }
  return { now, considered: due.length, results };
}
