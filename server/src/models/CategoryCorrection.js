import mongoose from 'mongoose';

/**
 * How the category assistant learns: every time a person picks a different
 * category than the one we proposed, each word of the description gets a
 * vote for the category they chose. Next time the same words appear, that
 * category scores higher.
 */
const correctionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, lowercase: true, trim: true, maxlength: 40 },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  count: { type: Number, default: 1, min: 1 },
});

correctionSchema.index({ user: 1, token: 1, category: 1 }, { unique: true });
correctionSchema.index({ user: 1, token: 1 });

export default mongoose.model('CategoryCorrection', correctionSchema);
