import mongoose from 'mongoose';

/**
 * One movement of the micro-savings jar (WISH-2): money set aside, or taken
 * back out again.
 *
 * These rows are the jar's own audit trail. They are deliberately NOT
 * transactions — a deposit is not spending, so it must never reach the
 * income/expense ledger, the balance, the charts or the reports.
 *
 * `amount` is always positive; `kind` carries the direction. `wishItem` is
 * filled in when the money went towards a particular wish and left empty for a
 * plain "I am just saving" deposit.
 */
const jarMovementSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['deposit', 'withdraw'], required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    wishItem: { type: mongoose.Schema.Types.ObjectId, ref: 'WishItem', default: null },
    note: { type: String, trim: true, maxlength: 140, default: '' },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// The jar history is "mine, newest first".
jarMovementSchema.index({ user: 1, date: -1 });

export default mongoose.model('JarMovement', jarMovementSchema);
