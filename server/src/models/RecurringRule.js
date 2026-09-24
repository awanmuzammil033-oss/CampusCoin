import mongoose from 'mongoose';

/**
 * Recurring entries (TXN-3): a monthly allowance, a hostel fee, a streaming
 * subscription. The generator walks forward from lastGeneratedOn and stops —
 * running it twice on the same day must never create duplicates, so
 * lastGeneratedOn is the single source of truth for "what already exists".
 */
const ruleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    description: { type: String, trim: true, maxlength: 255, default: '' },
    frequency: { type: String, enum: ['weekly', 'monthly'], required: true },
    // Day within the period; 29–31 clamp to month end for shorter months.
    dayOfPeriod: { type: Number, min: 1, max: 31, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    lastGeneratedOn: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ruleSchema.index({ user: 1, isActive: 1 });

export default mongoose.model('RecurringRule', ruleSchema);
