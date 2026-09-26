import mongoose from 'mongoose';

/**
 * A group is a pot of shared money (GRP-1): a hostel room, a rented flat, a
 * project team. The owner is always `members[0]` — the whole split maths keys
 * off that position, so the array order is part of the data contract and is
 * never reshuffled after creation.
 *
 * A roommate who has not signed up yet is still added, with just a name and
 * an email address (`user: null`). That is what lets a bill be split with
 * someone before they ever register; the link fills in itself when their
 * account is found (see services/groups.js → addMember).
 */

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: {
      type: [memberSchema],
      validate: {
        validator: (rows) => Array.isArray(rows) && rows.length > 0,
        message: 'A group needs at least its owner.',
      },
    },
    currency: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/, default: 'USD' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

groupSchema.index({ owner: 1, archived: 1 });
// membership lookups ("which groups am I in?") run on every read
groupSchema.index({ 'members.user': 1, archived: 1 });

/** Every group the person owns or sits in — the only way a read starts. */
groupSchema.statics.forUser = function forUser(userId) {
  return this.find({ $or: [{ owner: userId }, { 'members.user': userId }] });
};

/** Where the signed-in person sits in the member list (-1 when they are out). */
groupSchema.methods.memberIndexOf = function memberIndexOf(userId) {
  if (!userId) return -1;
  if (String(this.owner) === String(userId)) return 0;
  return this.members.findIndex((m) => m.user && String(m.user) === String(userId));
};

export default mongoose.model('Group', groupSchema);
