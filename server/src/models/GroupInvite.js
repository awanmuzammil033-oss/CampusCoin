import mongoose from 'mongoose';

/**
 * A group's one QR-code invite (NEW-7) — the paper version of "add a
 * roommate". Somebody who may `manage` a group asks for a code, prints it on a
 * noticeboard, and the person who scans it joins as a plain `member`.
 *
 * FOUR THINGS THIS DOCUMENT DELIBERATELY DOES NOT HAVE
 * ----------------------------------------------------
 *
 *  1. The token, in plain text. Only `tokenHash` is stored, and it is
 *     `select: false` — the same discipline the password reset uses for its
 *     code (models/User.js → resetCodeHash), so a careless `find()` anywhere in
 *     the app cannot put a live invite's secret into a response. The plain
 *     token exists for exactly one request: the one that mints it.
 *
 *  2. A role, a name, or an email. An invite is not an invitation to a
 *     particular person and it grants nobody any power: the joiner becomes a
 *     `member`, which may only `view` (see GROUP_ROLES in services/groups.js).
 *     The single-use flag below is what stops the link being forwarded, and it
 *     needs no address to do that.
 *
 *  3. A count of attempts against itself. The token is 256 bits of
 *     `crypto.randomBytes`, so there is no guessable space for a per-row
 *     attempt counter to protect — the meaningful bound on abuse is per ACCOUNT
 *     and lives in the service (a QR on a poster is walked into by people, not
 *     guessed at by scripts).
 *
 *  4. `revokedAt` as anything but a date. A revoke is recorded, never deleted:
 *     the row is the answer to "was this out there, and when did it stop being
 *     out there", and the same three fields (`usedAt` / `revokedAt` /
 *     `expiresAt`) are the whole definition of "live".
 *
 * AN EXPIRY IS AN INSTANT, NOT A CALENDAR DAY
 * -------------------------------------------
 * The bill ledger stores dates at UTC midnight because a bill has a DAY. An
 * invite expiry has a moment, and it is stored as that moment: 48 hours from
 * now, exactly. Rounding it to a midnight would make the real window anywhere
 * between 47 and 49 hours depending on the hour of the day, which is the same
 * class of bug as recomputing an expiry from a duration on every read.
 */

const groupInviteSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    // sha256 of the token, hex. Unique: two invites must never share a code,
    // and the unique index is what lets the public read be a single index seek
    // rather than a scan.
    tokenHash: { type: String, required: true, select: false },
    // Kept for the audit trail and never rendered: a stranger is told the
    // group's NAME and nothing else, and an owner's name printed next to it
    // would be a detail about a group they are not in.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    // The single-use flag. `usedAt` is set by an atomic claim, never by a
    // read-then-write, so two taps on a confirm button cannot both win it.
    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    validate: {
      validator: (doc) => doc.expiresAt instanceof Date && !Number.isNaN(doc.expiresAt.getTime()),
      message: 'An invite needs a real expiry date.',
    },
  }
);

// The public read and the join both look an invite up BY this hash, on every
// request, with no session to narrow it. It is the only route into the
// collection, so it carries the one index that matters.
groupInviteSchema.index({ tokenHash: 1 }, { unique: true });
// The group-scoped list ("what is out there for this group right now").
groupInviteSchema.index({ group: 1, createdAt: -1 });

export default mongoose.model('GroupInvite', groupInviteSchema);
