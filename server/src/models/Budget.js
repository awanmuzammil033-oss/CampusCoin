import mongoose from 'mongoose';

/**
 * A monthly spending limit for one category (BUD-1).
 * `month` is always stored as the 1st of the month so the unique index
 * keeps a clean "one budget per category per month" rule and the alert
 * service can look the row up with an exact match.
 */
const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    month: { type: Date, required: true },
    limitAmount: { type: mongoose.Schema.Types.Decimal128, required: true },
  },
  { timestamps: true }
);

budgetSchema.index({ user: 1, category: 1, month: 1 }, { unique: true });
budgetSchema.index({ user: 1, month: 1 });

/** First day of the given date's month — used everywhere a month is keyed. */
export function monthStart(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export default mongoose.model('Budget', budgetSchema);
