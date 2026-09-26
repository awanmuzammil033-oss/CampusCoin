import mongoose from 'mongoose';

/**
 * One entry in the side-income library (ADV-5).
 *
 * These are IDEAS, not income. Nothing here promises a student anything: the
 * rows describe how a kind of work is usually organised, what it takes in
 * time, and what it costs to start — no figure is quoted that an
 * administrator has not cited. The page says the same thing out loud, so a
 * row can never be read as a guarantee.
 *
 * That is why the citation fields exist and why `isTrending` is gated on one
 * of them (see services/incomeIdeas.js): a badge that says "students are
 * doing this a lot" is a claim about the world, and a claim that cannot be
 * checked is a claim a reviewer should not have to accept. A sourceUrl points
 * at the page the figure came from; a sourceNote names it in words when there
 * is no single address. At least one of the two is required before an entry
 * can be marked trending — a non-trending idea may sit unsourced until an
 * administrator has done the reading.
 *
 * The whole library is shared and read-only for students, so rows carry no
 * user id: there is nothing per-person here to leak.
 */
const incomeIdeaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 90 },
    category: {
      type: String,
      enum: ['part-time', 'freelance', 'reselling', 'services'],
      required: true,
    },
    summary: { type: String, required: true, maxlength: 300 },
    howItWorks: { type: String, maxlength: 1200, default: '' },
    // Plain words, not hours or a number: "two evenings a week" tells a
    // student more than a figure, and it cannot go stale like one.
    typicalEffort: { type: String, maxlength: 120, default: '' },
    // Also plain words ("None", "A phone you already own") so nobody has to
    // read a currency to know whether starting costs anything.
    startupCost: { type: String, maxlength: 120, default: '' },
    isTrending: { type: Boolean, default: false },
    sourceUrl: { type: String, trim: true, maxlength: 300, default: '' },
    sourceNote: { type: String, trim: true, maxlength: 200, default: '' },
    // A colour emoji the administrator picked, kept as text (like WishItem's
    // icon) so the client always renders exactly what was chosen.
    icon: { type: String, trim: true, maxlength: 16, default: '💡' },
    isActive: { type: Boolean, default: true },
    // The admin panel's own ordering; ties fall back to the title so the grid
    // is never reshuffled between two reads of the same data.
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// The page always reads "active, trending first, in the coordinator's order"
// — one index serves the list, the category chip and the trending chip.
incomeIdeaSchema.index({ isActive: 1, isTrending: -1, sortOrder: 1 });

export default mongoose.model('IncomeIdea', incomeIdeaSchema);
