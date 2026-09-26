import mongoose from 'mongoose';

/**
 * One shared bill inside a group (GRP-2): the mess bill, the rent, the weekly
 * grocery run. `amount` and the resolved per-person amounts are Decimal128 so
 * a group of three splitting 100.00 never drifts by a cent.
 *
 * `paidByIndex` is a position in `group.members` (0 is the owner by
 * construction) rather than a user id, because a member who has not signed up
 * yet is a perfectly valid payer.
 *
 * `shares` keeps what the person asked for — a relative weight for 'shares',
 * a money amount for 'exact', nothing for 'equal'. It is the record of the
 * request, not the answer.
 *
 * `split` is the answer: the server works the split out once, at write time,
 * and stores the per-member money amounts as Decimal128. The balance board
 * then sums those inside MongoDB (`$unwind` + `$group` + `$sum`) and gets
 * figures that always add up to the bill — recomputing a split later from
 * weights and floats would not.
 *
 * `includedIndexes` is WHO the bill was split between — the positions the owner
 * ticked, sorted. It is a record of the question, not of the answer: `split`
 * still holds the money, so the board is unchanged by a subset split. A bill
 * written before this field existed has none, which means "between everybody" —
 * that is the only thing it could have meant, so the reader resolves it to the
 * full member list rather than guessing (see `includedOn` in services/groups.js).
 */

const shareSchema = new mongoose.Schema(
  {
    memberIndex: { type: Number, required: true, min: 0 },
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const splitLineSchema = new mongoose.Schema(
  {
    memberIndex: { type: Number, required: true, min: 0 },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { _id: false }
);

const groupExpenseSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    paidByIndex: { type: Number, required: true, min: 0 },
    splitType: { type: String, enum: ['equal', 'shares', 'exact'], default: 'equal' },
    shares: { type: [shareSchema], default: [] },
    split: { type: [splitLineSchema], default: [] },
    // The positions this bill is split between. `default: undefined` is
    // deliberate: a bill saved before this field existed must have NO value
    // here, because "undefined" is what the reader reads as everybody, and a
    // default of "all members" would quietly rewrite what old rows said.
    includedIndexes: { type: [Number], default: undefined },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    date: { type: Date, required: true, default: () => new Date() },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// the bills list of one group, newest first — the only read pattern
groupExpenseSchema.index({ group: 1, date: -1 });

export default mongoose.model('GroupExpense', groupExpenseSchema);
