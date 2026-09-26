import mongoose from 'mongoose';

/**
 * One line in a group's chat (GRP-4): either something somebody typed, or a
 * small poll card — "chai at 4pm, 350 per head, who's in?" — that members tick
 * themselves into. One collection for both kinds, because the room is read as
 * one list in time order and a second table for the cards would mean two
 * queries plus a merge that has to know which line came first.
 *
 * `senderIndex` is a position in `group.members` for the same reason a bill's
 * payer is one: a roommate with no account is still somebody in the room, and a
 * chat that only accepted account ids would shut out half a hostel.
 *
 * The category is stored as a KEY ('chai', 'transport', …), never as English
 * prose: the wording of a card is the client's, in the language the student
 * picked — the same rule as the growth guide's nudge (see services/growMoney.js).
 * There is no sentence in this file for a translator to find.
 *
 * A card is NOT money. Nothing here ever reaches the balance board, which sums
 * `GroupExpense.split` and knows nothing about chats: a card is a plan, not a
 * bill, so deleting one cannot move anybody's balance. `rate` is Decimal128 all
 * the same, because the running total is shown on the card and 350 x 3 has to be
 * 1050.00 exactly, not 1049.9999999999999.
 */

const responseSchema = new mongoose.Schema(
  {
    memberIndex: { type: Number, required: true, min: 0 },
    // `null` is a real state, not "no answer": it means "has not ticked yet",
    // which is the whole reason a card can show who is still out. Tapping the
    // same button twice puts it back to null.
    yes: { type: Boolean, default: null },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['chai', 'transport', 'food', 'outing', 'shopping', 'other'],
      required: true,
    },
    location: { type: String, trim: true, maxlength: 120, default: '' },
    purpose: { type: String, trim: true, maxlength: 120, default: '' },
    // The empty string means "not given", so the shape test has to allow it —
    // every other field on this subdocument is optional.
    date: { type: String, trim: true, match: /^$|^\d{4}-\d{2}-\d{2}$/, default: '' },
    time: { type: String, trim: true, match: /^$|^([01]\d|2[0-3]):[0-5]\d$/, default: '' },
    rate: { type: mongoose.Schema.Types.Decimal128, required: true },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    // Seeded with one pending row per member when the card is posted (see
    // services/groupChat.js). A member added afterwards does NOT get a row:
    // they were not on the invitation, and a card is a snapshot of who was
    // asked, not a live membership list.
    responses: { type: [responseSchema], default: [] },
  },
  { _id: false }
);

const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    kind: { type: String, enum: ['text', 'poll'], required: true },
    text: { type: String, trim: true, maxlength: 1000, default: '' },
    senderIndex: { type: Number, required: true, min: 0 },
    // Present only on a card, so a typed message has no empty object sitting in
    // the document pretending to be a poll.
    poll: { type: pollSchema, default: undefined },
  },
  {
    timestamps: true,
    // Which of the two shapes is required depends on `kind`, so the rule cannot
    // live on a single field; it is the one check the collection enforces on
    // top of what the service already validated.
    validate: {
      validator: (doc) => (doc.kind === 'poll' ? Boolean(doc.poll && doc.poll.rate) : Boolean(doc.text)),
      message: 'A message needs text, and a poll card needs a category and a rate.',
    },
  }
);

// The room is read oldest-first ("the last hundred messages, in order"), and
// this is the only read pattern — one index, no sort in memory.
groupMessageSchema.index({ group: 1, createdAt: 1 });

export default mongoose.model('GroupMessage', groupMessageSchema);
