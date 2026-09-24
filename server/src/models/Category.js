import mongoose from 'mongoose';

/**
 * Categories come in two flavours (CAT-1..5):
 *  - defaults: user field absent, managed by administrators, read-only for students;
 *  - personal: owned by one user, fully editable, and never allowed to clash
 *    with another personal category of the same type (case-insensitive).
 * nameKey is the lower-cased name — it makes the uniqueness check independent
 * of casing without needing a regex query.
 */
const categorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameKey: { type: String, required: true, lowercase: true, trim: true, maxlength: 60 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    isDefault: { type: Boolean, default: false },
    icon: { type: String, default: '' }, // small icon hint used by the picker chips
    isActive: { type: Boolean, default: true }, // soft delete keeps old transactions readable
  },
  { timestamps: true }
);

categorySchema.index(
  { user: 1, nameKey: 1, type: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }
);
categorySchema.index(
  { nameKey: 1, type: 1 },
  // partial index on `user: null` — MongoDB cannot build partial indexes on
  // $exists:false, and defaults always carry user:null anyway
  { unique: true, partialFilterExpression: { user: null } }
);

/** Everything a user is allowed to spend under: defaults + their own. */
categorySchema.statics.forUser = function forUser(userId) {
  return this.find({ $or: [{ user: userId }, { user: null, isDefault: true }] }).sort({ type: 1, name: 1 });
};

/** Admin view: only the system-wide defaults. */
categorySchema.statics.defaults = function defaults(type) {
  const q = { user: null, isDefault: true, isActive: true };
  if (type) q.type = type;
  return this.find(q).sort({ type: 1, name: 1 });
};

export default mongoose.model('Category', categorySchema);
