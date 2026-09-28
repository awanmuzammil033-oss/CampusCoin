import mongoose from 'mongoose';
import { monthStart } from './Budget.js';

/**
 * In-app alerts (BUD-3). The unique index on
 * (user, kind, category, month) is what stops alert spam: crossing 80%
 * twice in a month, or editing transactions back and forth, can only ever
 * insert one "budget_near" row per category per month.
 * System/announcement notices are excluded from that index on purpose —
 * there may be many of those.
 *
 * Renewal notices (NEW-6) are a second family with the same one-sentence
 * rule, keyed on (user, kind, rule, dueOn): one warning per subscription per
 * due date, however many times the screen is opened. They carry `messageKey`
 * plus `data` so the client builds the sentence in the reader's language;
 * `message` is only a short English fallback for anything reading the raw
 * field. `renewal_charged` is the notice for a charge that has already gone
 * out, reserved here so the pair stays in one place.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: {
      type: String,
      enum: [
        'budget_near',
        'budget_exceeded',
        'system',
        'announcement',
        'renewal_reminder',
        'renewal_charged',
      ],
      required: true,
    },
    message: { type: String, required: true, maxlength: 400 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    month: { type: Date, default: null },
    // The recurring entry a renewal notice is about. Always set for the
    // renewal kinds, which is what the second index below relies on.
    rule: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringRule', default: null },
    // The charge date the notice is warning about — the de-duplication key.
    dueOn: { type: Date, default: null },
    // What the client renders instead of `message`, and the values it needs.
    messageKey: { type: String, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index(
  { user: 1, kind: 1, category: 1, month: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ['budget_near', 'budget_exceeded'] } } }
);
notificationSchema.index(
  { user: 1, kind: 1, rule: 1, dueOn: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ['renewal_reminder', 'renewal_charged'] } } }
);
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

notificationSchema.statics.monthOf = monthStart;

export default mongoose.model('Notification', notificationSchema);
