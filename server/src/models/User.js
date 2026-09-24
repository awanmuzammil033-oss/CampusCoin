import mongoose from 'mongoose';

/**
 * Accounts. Email is the login identifier (AUTH-1) and the role decides
 * which half of the app the person may enter: /login for students,
 * /control/login for administrators (AUTH-3).
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    isActive: { type: Boolean, default: true }, // admins can disable an account (ADM-3)

    academicYear: { type: String, trim: true, maxlength: 30, default: '' },
    monthlyAllowanceBaseline: { type: mongoose.Schema.Types.Decimal128, default: null },
    monthlySavingsGoal: { type: mongoose.Schema.Types.Decimal128, default: null },

    // UX-1 / UX-2 — applied before first paint by the client so there is no flash
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    fontScale: { type: Number, min: 1, max: 4, default: 2 },

    // Display preferences picked in the topbar: how amounts are formatted and
    // which language the chrome speaks. Display only — never a conversion rate.
    currency: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/, default: 'USD' },
    language: { type: String, trim: true, match: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, default: 'en' },

    // Password reset (AUTH-5): we store only the hash of the token that was
    // emailed, it dies after an hour, and clearing it on success makes the
    // link single-use.
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    academicYear: this.academicYear,
    monthlyAllowanceBaseline: this.monthlyAllowanceBaseline,
    monthlySavingsGoal: this.monthlySavingsGoal,
    theme: this.theme,
    fontScale: this.fontScale,
    currency: this.currency,
    language: this.language,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
