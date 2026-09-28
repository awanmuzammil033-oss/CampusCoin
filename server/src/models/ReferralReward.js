import mongoose from 'mongoose';

/**
 * One earned referral reward (NEW-10).
 *
 * The app has no achievements/badges system of its own — there is no such
 * collection, route or dictionary anywhere in it — so a reward is this row,
 * and the badge the student sees is drawn from these rows by the client. It is
 * deliberately NOT money: nothing here can be added to a balance, spent from a
 * jar or counted into a report, because a reward that moved money would have
 * to be reconciled with the ledger and this feature must not touch the ledger.
 *
 * A row is written only when BOTH halves of the rule are true: the account
 * arrived through somebody's link, and it has since logged a transaction of its
 * own. The transaction's id is stored, so the claim "this friend really used
 * the app" is checkable months later rather than taken on trust.
 *
 * Two unique indexes do the anti-abuse work, and they do it in the database
 * rather than in a check-then-write (see services/referrals.js → awardOne):
 *
 *   { inviter, invitee }  one reward per invitee per inviter, ever
 *   { inviter, slot }      the cap. `slot` is a number 1..REFERRAL_CAP, so a
 *                         sixth reward has nowhere to be written at all and is
 *                         refused by the database instead of by a count that
 *                         two concurrent requests could both pass.
 */
const referralRewardSchema = new mongoose.Schema(
  {
    /** The account that earned this — the one whose badge it is. */
    inviter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** The account that qualified it. Its own row records the same link, once. */
    invitee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    /**
     * Which of the inviter's five rewards this is (1..5). A unique index on
     * (inviter, slot) turns "at most five" from a promise the service makes
     * into a fact the database refuses to break.
     */
    slot: { type: Number, required: true, min: 1, max: 5 },

    /**
     * The transaction that proved the invitee came to use the app. Kept as an
     * id rather than an amount, because the amount is that transaction's
     * business and this row only needs to point at the proof.
     */
    qualifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },

    /**
     * Two dates, deliberately. `qualifiedAt` is the exact moment, and it is the
     * audit answer to "when was this claimed". `qualifiedOn` is the same instant
     * flattened to UTC midnight, which is the app's rule for a calendar day: a
     * reward earned at 23:30 in Karachi must count for the same day as one
     * earned at 09:00, and a stored local-time date would drift.
     */
    qualifiedAt: { type: Date, required: true },
    qualifiedOn: { type: Date, required: true },
  },
  { timestamps: true }
);

// one reward per invitee per inviter, ever — a second request for the same
// pair is rejected by the database and the service reads that as success
referralRewardSchema.index({ inviter: 1, invitee: 1 }, { unique: true });
// the cap: five slots, and no sixth row can exist
referralRewardSchema.index({ inviter: 1, slot: 1 }, { unique: true });
// the audit reads: "what has this person earned, newest first"
referralRewardSchema.index({ inviter: 1, qualifiedOn: -1 });

export default mongoose.model('ReferralReward', referralRewardSchema);
