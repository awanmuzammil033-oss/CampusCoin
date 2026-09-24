import mongoose from 'mongoose';

/**
 * A concrete tip shown to one student for one month (TIP-1..3).
 * Ranked by potentialSavings; the person can pin it, dismiss it (it will not
 * come back this month) or bookmark it with a note.
 * The unique index guarantees the generator is safe to re-run.
 */
const userTipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'TipTemplate', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    month: { type: Date, required: true },
    textRendered: { type: String, required: true, maxlength: 500 },
    potentialSavings: { type: mongoose.Schema.Types.Decimal128, default: null },
    status: { type: String, enum: ['active', 'dismissed', 'pinned'], default: 'active' },
    isBookmarked: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

userTipSchema.index(
  { user: 1, template: 1, category: 1, month: 1 },
  { unique: true, partialFilterExpression: { category: { $type: 'objectId' } } }
);
// Tips without a category (savings gap, weekend spike) still need one row
// per template per month:
userTipSchema.index({ user: 1, template: 1, month: 1 }, { unique: true, partialFilterExpression: { category: null } });
userTipSchema.index({ user: 1, status: 1, month: 1 });

export default mongoose.model('UserTip', userTipSchema);
