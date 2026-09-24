import mongoose from 'mongoose';

/**
 * The monthly narrative (INS-1..5): a short plain-language summary, the
 * category(s) that grew against the user's own trend, and one piece of
 * actionable advice. Generated from aggregates only — descriptions and
 * personal details never take part. One row per user per month; regenerating
 * overwrites, so the history view stays one entry per month.
 */
const insightSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: Date, required: true }, // 1st of the month
    summaryText: { type: String, required: true },
    tipText: { type: String, default: '' },
    flags: [
      {
        _id: false,
        category: { type: String },
        pctChange: { type: Number },
        amount: { type: Number },
      },
    ],
    source: { type: String, enum: ['template', 'remote'], default: 'template' },
    isBookmarked: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

insightSchema.index({ user: 1, month: 1 }, { unique: true });
insightSchema.index({ user: 1, isBookmarked: 1 });

export default mongoose.model('Insight', insightSchema);
