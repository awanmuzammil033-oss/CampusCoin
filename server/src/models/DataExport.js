import mongoose from 'mongoose';

/**
 * One "download my data" job (NEW-1).
 *
 * THE JOB EXISTS BECAUSE THE GENERATION IS NOT INLINE
 * ---------------------------------------------------
 * A student with four years of entries has tens of thousands of rows. Building
 * that archive inside the POST that asked for it means a request that sits open
 * for a minute, and a student watching a spinner that long concludes the button
 * is broken and presses it again. So POST /api/export writes ONE row and
 * returns; the rows are read and the ZIP is written afterwards, and the screen
 * polls. The row is the whole of the queue - there is no in-memory list that a
 * restart would lose.
 *
 * `status` walks queued -> running -> ready | failed and nothing skips a step,
 * so a reader can always tell "not started yet" from "we are working on it"
 * from "there is a file" - three very different sentences.
 *
 * WHY THE COLUMNS ARE NOT A SETTING
 * ---------------------------------
 * The list of columns is a code constant (see services/dataExport.js →
 * EXPORT_COLUMNS), not something the student picks and not something the reader
 * has to guess. A backup whose shape depends on the software version that wrote
 * it is not a backup, and the column list is echoed into profile.json so the
 * file describes itself to whoever opens it in two years.
 *
 * THE TOKEN
 * ---------
 * A ready job hands out a single-use download token. Only its SHA-256 is
 * stored, it lives 24 hours, and the moment it is spent `tokenUsedAt` is written
 * and the hash is dropped - so the same link can never be replayed, not even by
 * the person who asked for it. The three fields are `select: false`: no other
 * query in the app can read a live token by accident, and a dump of this
 * collection is worth nothing to whoever finds it.
 */
const dataExportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: ['queued', 'running', 'ready', 'failed'],
      default: 'queued',
      required: true,
    },

    /**
     * The archive on the server's temp disk, never under the web root. Hidden
     * from every read for the same reason the token hash is: a path in a query
     * result is a path somebody can ask for.
     */
    filePath: { type: String, default: null, select: false },
    fileName: { type: String, trim: true, maxlength: 120, default: '' },
    bytes: { type: Number, default: 0 },

    /**
     * The ledger currency the amounts in this file are in, copied onto the job
     * when the archive is built. The archive keeps saying PKR after the student
     * moves their ledger to dollars next month, because the file was written
     * when the ledger was in PKR and relabelling a backup is a lie about it.
     */
    currency: { type: String, uppercase: true, trim: true, maxlength: 3, default: '' },

    requestedAt: { type: Date, default: () => new Date() },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },

    /**
     * A MACHINE code, never a sentence. The screen turns it into words from the
     * dictionary; a JavaScript error message written into a row is a sentence
     * the reader can end up looking at.
     */
    errorCode: { type: String, trim: true, maxlength: 40, default: null },

    // How much went in, so the card can say "42 entries" without opening the file.
    counts: {
      type: new mongoose.Schema(
        {
          transactions: { type: Number, default: 0 },
          categories: { type: Number, default: 0 },
          budgets: { type: Number, default: 0 },
          deleted: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: undefined,
    },

    /* ------------------------- the single-use download link ------------------ */
    tokenHash: { type: String, default: null, select: false },
    tokenExpiresAt: { type: Date, default: null, select: false },
    tokenUsedAt: { type: Date, default: null, select: false },
    tokenIssuedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// The card's own list ("your exports"), newest first. Everything else in the
// module is a point lookup by _id with the owner's id in the filter.
dataExportSchema.index({ user: 1, requestedAt: -1 });
// The sweep walks the rows that are still holding a file, whatever their status.
dataExportSchema.index({ filePath: 1, finishedAt: 1 });

dataExportSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    status: this.status,
    fileName: this.fileName || '',
    bytes: this.bytes || 0,
    currency: this.currency || '',
    counts: {
      transactions: this.counts?.transactions || 0,
      categories: this.counts?.categories || 0,
      budgets: this.counts?.budgets || 0,
      deleted: this.counts?.deleted || 0,
    },
    errorCode: this.errorCode || null,
    requestedAt: this.requestedAt,
    startedAt: this.startedAt,
    finishedAt: this.finishedAt,
  };
};

export default mongoose.model('DataExport', dataExportSchema);
