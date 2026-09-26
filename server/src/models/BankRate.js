import mongoose from 'mongoose';

/**
 * A published savings-account or Fixed Deposit rate (ADV-3).
 *
 * WHY this collection is reference information and can never become advice:
 *  - nobody here holds an account. Every figure is a transcription of what a
 *    bank published, typed in by an administrator, so it is a description of
 *    somebody else's product — never an offer, never a quote, and never
 *    personalised for the student reading it;
 *  - rates move whenever the bank says so, and this table cannot move with
 *    them. `sourceNote` records where a figure came from and roughly when, so
 *    a stale row reads as a stale row instead of passing itself off as today's
 *    rate, and the page it appears on always shows an "as of" date;
 *  - `isActive` retires a row without deleting the history of why it once
 *    showed up in a screenshot or a printed handout;
 *  - the disclaimer travels with the data: it is mandatory in the i18n
 *    dictionary (`sav.disclaimer`), on the page itself, and repeated inside
 *    the administrator's form so nobody publishes a rate without seeing it.
 *
 * `minAmount` is Decimal128 because it is an amount; `ratePercent` is a plain
 * Number because it is a percentage — it is never summed into a balance and
 * never converted between currencies anywhere in the app.
 */
const bankRateSchema = new mongoose.Schema(
  {
    bank: { type: String, required: true, trim: true, maxlength: 60 },
    accountType: { type: String, enum: ['savings', 'fd'], required: true },
    // 11.5 means 11.5% a year, exactly as printed on the bank's own sheet.
    ratePercent: { type: Number, required: true, min: 0, max: 100 },
    // 0 is the schema default and means "this bank publishes no minimum";
    // the service only ever writes a positive amount or null, and the page
    // shows a dash rather than a fake 0.00.
    minAmount: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    // Fixed Deposits run for a term; a plain savings account has none.
    tenureMonths: { type: Number, default: null, min: 1, max: 120 },
    region: { type: String, trim: true, maxlength: 60, default: '' },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    sourceNote: { type: String, trim: true, maxlength: 200, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// The two reads this table ever does: "the best active rate of this type",
// and "which rows are still published".
bankRateSchema.index({ accountType: 1, ratePercent: -1 });
bankRateSchema.index({ isActive: 1 });

export default mongoose.model('BankRate', bankRateSchema);
