import mongoose from 'mongoose';

/**
 * One account in a group's own chart of accounts (GRP-3): the small fixed set of
 * names a group's books are kept under — cash, bank, what members owe, what the
 * group owes, the fund, income, and the five kinds of spending.
 *
 * The chart is SEEDED, not built by hand: the twelve rows below are inserted the
 * first time anybody opens the ledger for a group, so a group created before
 * this feature started working the day somebody looked. Nothing here is ever
 * edited or deleted, because an account whose name or type moved would silently
 * rewrite what every entry posted against it was saying.
 *
 * `system` marks the seeded rows. It is not a permission and it is not read by
 * any rule in the service — it is there so a person looking at a collection can
 * tell "the chart we seed" from "a row somebody added by hand", which is the
 * same reason the other collections in this app keep their seeded rows marked.
 *
 * The unique index on `{ group, code }` is what makes the seed safe: two people
 * opening the same empty group in the same instant both find no accounts, and
 * the loser of the insert is refused by the database instead of producing a
 * group with two of everything.
 */

const groupAccountSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    // Four digits, so a journal line can name its account in the payload and the
    // entry still reads like a ledger ("Dr 1010 Bank account") rather than an
    // object id. Unique per group, never globally: two groups can both have a
    // 1010, and neither can be asked about the other's.
    code: { type: String, required: true, trim: true, match: /^\d{4}$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: {
      type: String,
      enum: ['asset', 'liability', 'equity', 'income', 'expense'],
      required: true,
    },
    system: { type: Boolean, default: false },
  },
  { timestamps: true }
);

groupAccountSchema.index({ group: 1, code: 1 }, { unique: true });

export default mongoose.model('GroupAccount', groupAccountSchema);
