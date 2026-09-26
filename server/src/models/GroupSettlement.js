import mongoose from 'mongoose';

/**
 * A settlement (GRP-3): "Bilal paid Aisha 45.00 cash", the record that takes
 * money off two balances without touching the bills behind them.
 *
 * From/to are member positions in `group.members`, for the same reason the
 * bills use them — a roommate without an account is still one of the people
 * settling up. Rows are never edited: a wrong settlement is settled the other
 * way, and the history stays readable.
 */

const groupSettlementSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    fromIndex: { type: Number, required: true, min: 0 },
    toIndex: { type: Number, required: true, min: 0 },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

groupSettlementSchema.index({ group: 1, date: -1 });

export default mongoose.model('GroupSettlement', groupSettlementSchema);
