import mongoose from 'mongoose';

/**
 * One money movement (TXN-1..6).
 * The sign is not stored — `type` decides whether it adds to or takes from
 * the balance, and amount is always strictly positive (CHECK > 0 in the SQL
 * deliverable, the validator here does the same job).
 * Rows are never hard-deleted: `isDeleted` flips and every change is copied
 * into TransactionHistory (TXN-4).
 */
const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
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
  },
  { timestamps: true }
);

// The two hot paths — the list view and every monthly aggregation —
// both start from (user, date), so index them the way we query.
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, category: 1, date: -1 });
transactionSchema.index({ user: 1, isDeleted: 1, date: -1 });

transactionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    category: this.category,
    amount: this.amount,
    type: this.type,
    description: this.description,
    suggestedCategory: this.suggestedCategory,
    suggestionSource: this.suggestionSource,
    date: this.date,
    recurringRule: this.recurringRule,
    isDeleted: this.isDeleted,
    flag: this.flag,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Transaction', transactionSchema);
