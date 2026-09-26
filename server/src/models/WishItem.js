import mongoose from 'mongoose';

/**
 * One thing on the secret wishlist (WISH-1): the headphones, the book, the
 * trip the student is quietly saving for.
 *
 * The money that fills it is NOT a transaction. It lives in the micro-savings
 * jar on the account (User.jarBalance) and every movement in and out of the jar
 * is written to JarMovement — so nothing here can leak into the income/expense
 * ledger, the charts or the reports.
 *
 * `savedAmount` is Decimal128 and is only ever moved by the jar service; the
 * numbers it holds are the same cents the jar holds, split per wish. `status`
 * follows the arithmetic (achieved once saved reaches target) and is never
 * something the client can assert on its own.
 */
const wishItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    note: { type: String, trim: true, maxlength: 200, default: '' },

    targetAmount: { type: mongoose.Schema.Types.Decimal128, required: true },
    savedAmount: { type: mongoose.Schema.Types.Decimal128, default: 0 },

    // A plain emoji the student picked ('🎧', '📚', …). Kept as text rather
    // than a fixed enum so the client always renders exactly what was chosen.
    icon: { type: String, trim: true, maxlength: 16, default: '🎁' },

    status: { type: String, enum: ['saving', 'achieved', 'paused'], default: 'saving' },
    targetDate: { type: Date, default: null }, // soft "by when", never a deadline
    achievedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The page always asks for "my wishes, newest first, by status" — one index
// serves the list and the paused/achieved filters.
wishItemSchema.index({ user: 1, status: 1, createdAt: -1 });

export default mongoose.model('WishItem', wishItemSchema);
