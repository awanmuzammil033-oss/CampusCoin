import mongoose from 'mongoose';
import { monthStart } from './Budget.js';

/**
 * In-app alerts (BUD-3). The unique index on
 * (user, kind, category, month) is what stops alert spam: crossing 80%
 * twice in a month, or editing transactions back and forth, can only ever
 * insert one "budget_near" row per category per month.
 * System/announcement notices are excluded from that index on purpose —
 * there may be many of those.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: {
      type: String,
      enum: ['budget_near', 'budget_exceeded', 'system', 'announcement'],
      required: true,
    },
    message: { type: String, required: true, maxlength: 400 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    month: { type: Date, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index(
  { user: 1, kind: 1, category: 1, month: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ['budget_near', 'budget_exceeded'] } } }
);
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

notificationSchema.statics.monthOf = monthStart;

export default mongoose.model('Notification', notificationSchema);
