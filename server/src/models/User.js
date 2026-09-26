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
    // which language the chrome speaks.
    //
    // `currency` is the DISPLAY currency (what the picker shows) and
    // `ledgerCurrency` is what the student's amounts are actually denominated
    // in — stored numbers never change, so the two must be kept apart or
    // "400 PKR" would quietly become "400 dollars" the moment the display
    // currency moved. Conversion happens in the reader, from a dated reference
    // table (client/src/data/fx.js); no rate is ever written to a record.
    currency: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/, default: 'USD' },
    ledgerCurrency: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/, default: 'USD' },
    language: { type: String, trim: true, match: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, default: 'en' },

    // Micro-savings jar (WISH-2): money the student has set aside inside the
    // app, kept out of the transaction ledger so it never looks like spending.
    jarBalance: { type: mongoose.Schema.Types.Decimal128, default: 0 },

    // Survival mode (SURV-1): the strict daily budget the student asked for.
    // It is a switch with a timestamp, not a derived number — the plan itself
    // is recomputed from the ledger on every read so it can never go stale.
    survivalMode: {
      enabled: { type: Boolean, default: false },
      since: { type: Date, default: null },
    },

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
    ledgerCurrency: this.ledgerCurrency || this.currency,
    jarBalance: this.jarBalance,
    survivalMode: { enabled: Boolean(this.survivalMode?.enabled), since: this.survivalMode?.since || null },
    language: this.language,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
