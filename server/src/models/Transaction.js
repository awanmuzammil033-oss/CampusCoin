import mongoose from 'mongoose';

import { toNum } from '../utils/money.js';

/**
 * One money movement (TXN-1..6).
 * The sign is not stored — `type` decides whether it adds to or takes from
 * the balance, and amount is always strictly positive (CHECK > 0 in the SQL
 * deliverable, the validator here does the same job).
 * Rows are never hard-deleted: `isDeleted` flips and every change is copied
 * into TransactionHistory (TXN-4).
 */
/**
 * A payment that arrived as a scanned code rather than as typing (ADV-6).
 *
 * The original amount and currency are kept exactly as the code stated them,
 * next to the rate that moved it and the day that rate was good for. Six months
 * later "600 PKR" on a receipt is only checkable if the code that produced it
 * was written down, so the raw payload is stored too - it is the receipt.
 */
const scanSchema = new mongoose.Schema(
  {
    merchant: { type: String, default: '', maxlength: 120 },
    originalAmount: { type: mongoose.Schema.Types.Decimal128, default: null },
    originalCurrency: { type: String, default: '', uppercase: true, maxlength: 3 },
    rate: { type: Number, default: null },
    rateAsOf: { type: String, default: '' },
    rateSource: { type: String, default: '' },
    reference: { type: String, default: '', maxlength: 80 },
    raw: { type: String, default: '', maxlength: 400 },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

    /**
     * Which pocket this entry went through (NEW-11). It says WHERE, never WHAT
     * FOR: the category already says that, and the two are independent - one
     * expense can be paid from cash and the next from the same mobile wallet.
     *
     * Nothing about a wallet enters any total. A report sums `amount` by
     * `type`, so filing an entry to a wallet cannot move a figure anywhere -
     * which is what lets this be one optional field on a model every report
     * already reads, instead of a change to every report.
     *
     * Null means "not filed to a pocket", which is the honest state for an entry
     * logged before wallets existed.
     */
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    description: { type: String, trim: true, maxlength: 255, default: '' },

    // Category the assistant proposed while typing; the person always decides.
    suggestedCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    suggestionSource: { type: String, enum: ['history', 'keywords', 'remote'], default: null },

    date: { type: Date, required: true },
    recurringRule: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringRule', default: null },

    isDeleted: { type: Boolean, default: false },
    flag: { type: String, enum: ['none', 'large', 'duplicate'], default: 'none' },
    // set only when the amount came out of a scanned payment code
    scan: { type: scanSchema, default: null },
  },
  { timestamps: true }
);

// The two hot paths — the list view and every monthly aggregation —
// both start from (user, date), so index them the way we query.
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, category: 1, date: -1 });
transactionSchema.index({ user: 1, isDeleted: 1, date: -1 });
// one wallet's own history, newest first - the same shape as the list above
transactionSchema.index({ user: 1, wallet: 1, date: -1 });

transactionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    category: this.category,
    wallet: this.wallet ? this.wallet.toString() : null,
    amount: this.amount,
    type: this.type,
    description: this.description,
    suggestedCategory: this.suggestedCategory,
    suggestionSource: this.suggestionSource,
    date: this.date,
    recurringRule: this.recurringRule,
    isDeleted: this.isDeleted,
    flag: this.flag,
    scan: this.scan
      ? {
          merchant: this.scan.merchant || '',
          // a Decimal128 has to become a number here, the same as every other
          // amount in this app - handed raw it reaches the client as an object
          originalAmount: this.scan.originalAmount ? toNum(this.scan.originalAmount) : null,
          originalCurrency: this.scan.originalCurrency || '',
          rate: this.scan.rate,
          rateAsOf: this.scan.rateAsOf || '',
          rateSource: this.scan.rateSource || '',
          reference: this.scan.reference || '',
        }
      : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Transaction', transactionSchema);
