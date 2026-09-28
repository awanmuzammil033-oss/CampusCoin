import mongoose from 'mongoose';

/**
 * A movement of money between two of the reader's own wallets (NEW-11).
 *
 * This collection EXISTS SO THAT A TRANSFER IS NOT A TRANSACTION. Moving 2,000
 * from notes in a pocket to a mobile wallet is one event with two sides, and
 * neither side is income or an expense. The obvious implementation - write an
 * expense out of one wallet and an income into another - is the one that breaks
 * the app: the income report would show money that was never earned, the expense
 * report would show money that was never spent, the budget for that category
 * would be eaten by a top-up, and the month total would be wrong by the amount
 * moved. Every one of those is a number the student would then act on.
 *
 * So a transfer lives here, on its own, and the only place it is ever summed is
 * the wallet balance - which is exactly the one place where it belongs.
 *
 * The two sides are explicit rather than implied: `from` and `to` are both
 * required, and the service refuses `from === to` before anything is written,
 * because a transfer with one end is just a note with extra fields.
 *
 * There is no `type` field here and there is no `category`: a transfer has no
 * category, and inventing one would let a transfer be counted in a category's
 * spending - which is the bug this collection exists to prevent.
 */
const transferSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    from: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },

    /** Always positive. Which way it goes is `from` -> `to`, never a sign. */
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },

    /** UTC midnight, the way every other date in this app is stored. */
    date: { type: Date, required: true },

    /** "Topped up the food wallet" - why the money moved, for the history row. */
    note: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { timestamps: true }
);

// The wallet's own history, newest first, and the balance aggregation.
transferSchema.index({ user: 1, date: -1 });
transferSchema.index({ user: 1, from: 1, date: -1 });
transferSchema.index({ user: 1, to: 1, date: -1 });

transferSchema.methods.toPublic = function toPublic(wallets) {
  return {
    id: this._id.toString(),
    from: {
      id: this.from.toString(),
      name: wallets?.get(this.from.toString())?.name || '',
      kind: wallets?.get(this.from.toString())?.kind || '',
    },
    to: {
      id: this.to.toString(),
      name: wallets?.get(this.to.toString())?.name || '',
      kind: wallets?.get(this.to.toString())?.kind || '',
    },
    amount: Number(this.amount.toString()),
    date: this.date,
    note: this.note || '',
    createdAt: this.createdAt,
  };
};

export default mongoose.model('WalletTransfer', transferSchema);
