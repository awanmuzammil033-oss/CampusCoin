import mongoose from 'mongoose';

/**
 * One bank reconciliation (GRP-7): a group's own book balance for one account
 * set beside the lines a real bank statement shows, every line classified, and
 * the difference between the two either explained or refused.
 *
 * The session is a WORKBENCH, not a record of the answer: `status` moves from
 * 'draft' to 'reconciled' only when the difference is zero and nothing is left
 * unclassified, and there is only ever one open ('draft') session per group. The
 * partial unique index below is what enforces that — two treasurers cannot each
 * start a session and then argue about which statement belongs to which.
 *
 * The statement lines live ON the session (`key` names one), because that is
 * where a classification has to be kept: which line was matched to which book
 * line, which one is the group's money, which one is not the group's money at
 * all and why.
 *
 * What is NOT kept here is the book side. The account's balance, its lines, and
 * every line's reference come from the journal on each read, so a correction
 * posted to the books moves this session with no second copy to fall out of
 * step — and that is the whole reason a reconciliation can be trusted a month
 * after it was closed.
 *
 * `outstanding` is the one book-side decision that is stored, and it lives here
 * rather than on the journal line because a journal entry is immutable: "this
 * cheque is still in transit" is a statement about the bank, not an edit to a
 * posted entry.
 */

const statementLineSchema = new mongoose.Schema(
  {
    // Short and unique inside the session, and given by the server, so a client
    // that renames or reorders rows it is holding cannot lose the line it was
    // looking at.
    key: { type: String, required: true, trim: true, maxlength: 20 },
    date: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    description: { type: String, trim: true, maxlength: 120, default: '' },
    // SIGNED, and this is the one field where a negative number is normal: the
    // bank says what left the account as well as what arrived, and a statement
    // pasted in the order the bank lists it keeps both signs.
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    // 'matched' — paired by the server with a book line of the same amount and
    //   a date within five days;
    // 'book'   — the group's own money that the books have been told about (or
    //   are about to be: the entry is posted in the same request);
    // 'ignore' — on the statement, but not the group's money. A reason is
    //   required, because a line somebody else made on a shared account has to
    //   be written down to count;
    // 'open'   — nobody has decided yet, and a session with one cannot close.
    as: { type: String, enum: ['matched', 'book', 'ignore', 'open'], default: 'open' },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupJournalEntry', default: null },
    entryLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const groupReconcileSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    // The account being reconciled. An account code, not an id, because the
    // chart is this group's own and a code is what the statement and the trial
    // balance both use. The service refuses anything that is not an asset.
    accountCode: { type: String, required: true, trim: true, match: /^\d{4}$/ },
    statementDate: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    statementBalance: { type: mongoose.Schema.Types.Decimal128, required: true },
    lines: { type: [statementLineSchema], default: [] },
    status: { type: String, enum: ['draft', 'reconciled'], default: 'draft' },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    by: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reconciledAt: { type: Date, default: null },
    reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // the journal line ids this session has put in transit (see the note above)
    outstanding: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

// the open session of one group, and there can only be one: a second 'draft' is
// refused by the database, which is the only way to be sure two people clicking
// "start" in the same second cannot both get their own workbench
groupReconcileSchema.index({ group: 1 }, { unique: true, partialFilterExpression: { status: 'draft' } });

export default mongoose.model('GroupReconcile', groupReconcileSchema);
