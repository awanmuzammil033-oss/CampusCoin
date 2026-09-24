import mongoose from 'mongoose';

/** Campus-wide messages an administrator posts (ADM-2); shown to students
 *  in the notifications feed while they are active. */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

announcementSchema.index({ isActive: 1, startsAt: -1 });

/** Currently visible announcements, newest first. */
announcementSchema.statics.live = function live(now = new Date()) {
  return this.find({
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  }).sort({ startsAt: -1 });
};

export default mongoose.model('Announcement', announcementSchema);
