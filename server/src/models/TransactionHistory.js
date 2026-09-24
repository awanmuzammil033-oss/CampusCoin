import mongoose from 'mongoose';

/**
 * Append-only audit trail (TXN-4). Every create/update/delete/restore of a
 * transaction copies the before/after snapshots here as plain objects, so the
 * history page can show what changed even after the category itself is renamed
 * or the row is edited many times.
 */
const historySchema = new mongoose.Schema({
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['create', 'update', 'delete', 'restore'], required: true },
  before: { type: Object, default: null },
  after: { type: Object, default: null },
  changedAt: { type: Date, default: Date.now },
});

historySchema.index({ user: 1, transaction: 1, changedAt: -1 });

export default mongoose.model('TransactionHistory', historySchema);
