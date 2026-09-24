import mongoose from 'mongoose';

/**
 * Wording the administrators control (ADM-2). A tip rule in the engine
 * renders `bodyTemplate` with its own numbers — that way a coordinator can
 * reword or retire advice without a code change.
 * Placeholders look like {{amount}} and are filled at generation time.
 */
const tipTemplateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    kind: { type: String, enum: ['tip', 'announcement'], default: 'tip' },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    bodyTemplate: { type: String, required: true, maxlength: 500 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    minSavings: { type: mongoose.Schema.Types.Decimal128, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('TipTemplate', tipTemplateSchema);
