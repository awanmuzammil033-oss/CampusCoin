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

    /**
     * The address a password reset is sent to (AUTH-5) — and the ONLY address
     * one works from.
     *
     * It is separate from `email` on purpose. `email` is the sign-in name: it
     * shows up in screenshots, on shared machines and in the seed, so anyone who
     * can type it must not be able to take the account over. The recovery
     * address is the one the student keeps private, is asked for at sign-up
     * (never optional) and can be changed from the profile. Knowing it is what
     * proves the request is really yours.
     *
     * Unique, so one address can only ever point at one account — otherwise
     * "which student does this reset belong to?" would be a coin toss.
     */
    recoveryEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    /**
     * True once the student has picked this address themselves (at sign-up or
     * from the profile). The demo seed will fill in an address for the accounts
     * it owns, but never overwrites one a person chose.
     */
    recoveryEmailChosen: { type: Boolean, default: false },

    role: { type: String, enum: ['student', 'admin'], default: 'student' },

    /* ------------------------------------------------------------- NEW-1 --
     * Account deletion, with a grace period. All three parts travel together and
     * are absent until somebody asks, which is the state every account that
     * already exists is in.
     *
     * The grace period is the point of the feature, so the day is STORED rather
     * than derived from a setting: `scheduledFor` is written once, when the request
     * is made. A student who asks to leave, changes their mind, and asks again
     * must not find the clock restarted by the second request.
     *
     * `anonymisedAt` is set by the work, never by the request, so its presence is
     * proof the anonymising happened rather than a promise that it will.
     * `formerName` is kept so a group this person was in can show "Former member"
     * instead of a blank row or a stranger's name.
     */
    deletion: {
      type: new mongoose.Schema(
        {
          requestedAt: { type: Date, default: null },
          scheduledFor: { type: Date, default: null },
          reason: { type: String, trim: true, maxlength: 300, default: '' },
          anonymisedAt: { type: Date, default: null },
          formerName: { type: String, trim: true, maxlength: 100, default: '' },
        },
        { _id: false }
      ),
      default: undefined,
    },

    /* ------------------------------------------------------------ NEW-10 --
     * The person's own referral code, and the person who brought them.
     *
     * A CODE rather than a link, because the link is built from it: /r/<code> is
     * the whole of what gets shared, and the code is what lets it be read with no
     * account and no network round trip. Uppercase and unambiguous on purpose: a
     * code containing a 0 next to an O is a support ticket the first time somebody
     * reads it out.
     *
     * `referredBy` is set ONCE, at sign-up, and never again. A field that can be
     * rewritten is a field that can be farmed.
     */
    referralCode: {
      type: String,
      // undefined, NOT null, and that is load-bearing. A sparse index skips the
      // documents where the field is absent; a null default makes Mongoose WRITE
      // the field on every document instead, so sparse skips nothing and every
      // account without a code collides on the same null. That is not theoretical:
      // it refused the second registration in this app's own test suite.
      default: undefined,
      // unique so two accounts can never be handed the same code - a shared link
      // that opens the wrong person's account is the whole failure here.
      unique: true,
      sparse: true,
    },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referredAt: { type: Date, default: null },

    /* ------------------------------------------------------------- NEW-8 --
     * The student's guardian, and the fact that they were asked.
     *
     * A guardian summary sends a copy of somebody's spending to a person who did
     * not choose to receive it, so the consent is stored WITH the address and the
     * moment it was given, never implied by the address being there. The service
     * refuses to issue a link without `consentedAt`, which is what makes that
     * field's existence the permission rather than a note.
     */
    guardian: {
      type: new mongoose.Schema(
        {
          email: { type: String, trim: true, lowercase: true, maxlength: 100, default: '' },
          consentedAt: { type: Date, default: null },
          lastIssuedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
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

    // Password reset (AUTH-5): a six-digit code, of which only the hash is
    // kept. It dies after ten minutes, after five wrong guesses, and is wiped
    // the moment it works. `attempts` is what makes guessing a code useless.
    resetCodeHash: { type: String, default: null, select: false },
    resetCodeExpires: { type: Date, default: null, select: false },
    resetCodeAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    // the student's own address, so the profile can show which one resets work
    recoveryEmail: this.recoveryEmail,
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
