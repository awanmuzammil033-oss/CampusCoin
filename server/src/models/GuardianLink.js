import mongoose from 'mongoose';

/**
 * A shared, read-only summary of ONE month, addressed to one guardian (NEW-8).
 *
 * A row here is a capability, not a session. It carries no cookie, no user id
 * the browser can act on and no route of its own: the only thing a holder of
 * the token can do is read one aggregate summary, and the row is the whole of
 * what that can ever return.
 *
 * `tokenHash` is the sha256 of the token and the token is NEVER stored. A dump
 * of this collection therefore hands an attacker nothing usable - the same rule
 * the password reset code already follows (see services/accounts.js), for the
 * same reason: a bearer secret that survives in a backup is no longer private.
 *
 * `month` is stored as the 1st of the month in UTC, the key every other
 * month-level query in the app uses, so the shared summary and the student's
 * own report narrow the same window rather than two that can drift apart.
 *
 * There is deliberately NO `revokedAt` field. Revoking DELETES the row (see
 * services/guardianSummary.js), because "the link is dead" is then true at the
 * storage layer and not merely true of the code path that happens to check a
 * flag - a future cache, a replica lag or a new read path cannot serve a row
 * that is not there.
 */
const guardianLinkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    month: { type: Date, required: true },
    issuedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// The read path is a single exact lookup on the hash, so this index is the
// whole of the hot path and it is unique: two rows can never share a token.
guardianLinkSchema.index({ tokenHash: 1 }, { unique: true });
// "every link this student has" - the lookup that revoking and re-issuing use.
guardianLinkSchema.index({ user: 1 });

export default mongoose.model('GuardianLink', guardianLinkSchema);
