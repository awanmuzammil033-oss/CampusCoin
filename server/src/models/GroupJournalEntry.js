import mongoose from 'mongoose';

/**
 * One journal entry in a group's books (GRP-3): a date, a memo, and two to
 * twenty lines, each naming an account and sitting on ONE side — a debit or a
 * credit — for an amount in whole cents. The debits and the credits are equal
 * or the entry is not written; that single rule is what makes the group's
 * books a set of accounts rather than a list of amounts somebody typed.
 *
 * A POSTED ENTRY IS IMMUTABLE. There is no update and no delete in this module,
 * and that is the most important decision here: an account book whose history
 * can be rewritten cannot be checked by anybody. A mistake is corrected by
 * posting the mirrored entry (services/groupLedger.js → reverseEntry), which
 * leaves the original exactly as it was and puts the two on the page together —
 * so the correction is visible as a correction instead of being quietly folded
 * away. The only thing that may be attached to a posted entry afterwards is a
 * flag, and a flag is a question, never an edit (the same rule as
 * GroupExpense.flag).
 *
 * `ref` is the per-group sequence (J-0001, J-0002, …) and is assigned by the
 * server: the client never sends one, so a payload cannot claim a number that
 * belongs to another entry or another group.
 *
 * Two lines may use the same account, and that is deliberately allowed. The
 * trial balance sums the movement per account, so two same-account lines are
 * just the net of the two — refusing them would only stop a treasurer from
 * writing one honest entry ("moved 200 between the two cash accounts") in the
 * shape they actually meant it.
 *
 * `by` is the position in `group.members` that posted the entry, for the same
 * reason a bill's payer is a position: a roommate with no account is still
 * somebody who can be in the room. `createdBy` is the account id behind that
 * position, kept alongside it because a position is only meaningful while the
 * member list is never reshuffled.
 */

const lineSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupAccount', required: true },
  // Exactly one of the two carries the money. The other is stored null rather
  // than 0 so a line cannot be mistaken for a zero-amount line, and the trial
  // balance's $sum simply ignores the null.
  debit: { type: mongoose.Schema.Types.Decimal128, default: null },
  credit: { type: mongoose.Schema.Types.Decimal128, default: null },
});

const flagSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, default: '' },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    at: { type: Date, default: () => new Date() },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolution: { type: String, default: '', maxlength: 200 },
  },
  { _id: false }
);

const groupJournalEntrySchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    // Per group, four digits, and never supplied by a client.
    ref: { type: String, required: true, trim: true, match: /^J-\d{4,}$/ },
    date: { type: Date, required: true, default: () => new Date() },
    memo: { type: String, required: true, trim: true, maxlength: 200 },
    lines: { type: [lineSchema], default: [] },
    // 'reconcile' means this entry was written by a bank reconciliation, and
    // `sourceRef` then names the statement line it was written for — so a person
    // reading the journal can walk from an entry back to the bank line that
    // asked for it.
    source: { type: String, enum: ['manual', 'reconcile'], default: 'manual' },
    sourceRef: { type: String, default: null, maxlength: 40 },
    flag: { type: flagSchema, default: null },
    by: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    // The service refuses a one-line entry and an unbalanced one before it gets
    // here, with a sentence meant for a student. This is the collection's own
    // last word, so a row written by any other means still cannot land with a
    // single line in it.
    validate: {
      validator: (doc) => Array.isArray(doc.lines) && doc.lines.length >= 2 && doc.lines.length <= 20,
      message: 'A journal entry needs between 2 and 20 lines.',
    },
  }
);

// the journal of one group, newest first — the only read pattern
groupJournalEntrySchema.index({ group: 1, date: -1 });
// the reference is the number people quote at each other ("check J-0042"), so it
// has to be unique inside a group: two entries with one number would make the
// correction conversation impossible to have.
groupJournalEntrySchema.index({ group: 1, ref: 1 }, { unique: true });

export default mongoose.model('GroupJournalEntry', groupJournalEntrySchema);
