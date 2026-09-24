import mongoose from 'mongoose';

/**
 * "Recently viewed / edited" across sessions (SYS-1).
 * We keep only the newest 20 rows per person — enough for a useful
 * strip on the dashboard without letting the table grow forever.
 */
const recentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  action: { type: String, enum: ['viewed', 'edited'], required: true },
  at: { type: Date, default: Date.now },
});

recentSchema.index({ user: 1, at: -1 });

export default mongoose.model('RecentActivity', recentSchema);
