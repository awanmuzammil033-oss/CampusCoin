import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setImmediate as defer } from 'node:timers/promises';

import { setImmediate } from 'node:timers';

import yazl from 'yazl';

import DataExport from '../models/DataExport.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import Budget from '../models/Budget.js';
import Wallet from '../models/Wallet.js';
import { toNum } from '../utils/money.js';

/**
 * "Download my data" (NEW-1) - a queued job that writes a ZIP to the server's
 * temp disk and hands out one single-use link for it.
 *
 * FOUR FILES, AND FOUR IS THE RIGHT NUMBER
 * ---------------------------------------
 * transactions.csv, categories.csv, budgets.csv, profile.json. That is the list
 * in the brief and it is also what a person would actually want to open: the
 * three things they typed, and one file that says who they are, what the
 * numbers are denominated in, and what every column means. Nothing else is
 * added, because a second opinion is a file nobody opens.
 *
 * THE COLUMNS ARE STATED, NOT GUESSED
 * -----------------------------------
 * They are a constant in this file (EXPORT_COLUMNS), they go in as the header
 * row of every CSV, and the same list is echoed into profile.json. A backup
 * whose shape depends on the software version that wrote it cannot be checked
 * against anything, and the person opening it in two years cannot tell what a
 * column means without guessing. Dates are `YYYY-MM-DD` (UTC midnight, the way
 * this app stores a day), a month key is `YYYY-MM`, and a timestamp is an
 * ISO-8601 instant - the three are different things and are named as such.
 *
 * THE BIN IS IN THE FILE
 * -----------------------
 * A transaction with `isDeleted: true` is still a row. A backup that quietly
 * drops the bin cannot restore a month the student deleted by accident, and
 * "did that delete actually happen or is this an old file?" is unanswerable
 * afterwards. The column is there so the answer is in the file.
 *
 * ONE CURRENCY, AND THE FILE SAYS WHICH
 * -------------------------------------
 * Every amount in every CSV is in the account's `ledgerCurrency` - the currency
 * the amounts are actually denominated in, which is NOT necessarily the currency
 * the student was reading the app in. A student who displays in PKR and keeps
 * the ledger in USD must not open a CSV that silently mixes the two, so the
 * amounts are never converted, the code is repeated on every money row, and
 * profile.json says so in a field of its own. It is also copied onto the job,
 * so a student who moves their ledger next month does not relabel last
 * month's file.
 *
 * THE ARCHIVE LIVES OUTSIDE THE WEB ROOT
 * --------------------------------------
 * `express.static(client/dist)` is the web root. An archive inside it would be
 * fetchable by anybody who guessed (or was told) a file name, and this app
 * serves the whole built client itself in production, so "outside the web root"
 * is the only real boundary here. The path used is the OS temp directory, in
 * its own `campuscoin-exports` folder, named after the job id so the name is
 * unguessable even if the folder leaks.
 *
 * HOW THE FILES STOP EXISTING
 * ---------------------------
 * An export nobody can ever delete is a privacy problem wearing a feature's
 * clothes, so there are two answers here and they cover different failures:
 *
 *   1. AGE SWEEP (the main one). `sweepStaleArchives()` removes every archive
 *      older than the link's own 24-hour life, marks the job `failed` with the
 *      code `expired`, and then sweeps any file in the folder that no longer
 *      belongs to a live job - which is what cleans up after a crash between
 *      writing the file and writing the row. It runs on every new job, fire
 *      and forget, so nothing waits on it and a failure there can never fail a
 *      request.
 *
 *   2. REPAIR ON READ. A download whose file has gone (someone cleaned the OS
 *      temp folder, which does happen) is marked `expired` rather than left
 *      pointing at nothing, so the card can say the archive is gone instead of
 *      offering a link to a file that 404s.
 *
 * The download is NOT deleted on read, on purpose: the token is the single-use
 * gate, and burning the file on the first click would mean the second click -
 * from a student who thought the first had failed - got nothing.
 */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** A job that claims to be `running` for longer than this died; treat it as done. */
const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * Every CSV column, in order, stated once. The header row and the row builders
 * both read this list, so a column can never be in one and not the other.
 */
export const EXPORT_COLUMNS = {
  'transactions.csv': [
    'id',
    'date',
    'type',
    'amount',
    'currency',
    'category',
    'description',
    'wallet',
    'isDeleted',
    'flag',
    'recurringRule',
    'createdAt',
    'updatedAt',
  ],
  'categories.csv': ['id', 'name', 'type', 'isDefault', 'isActive', 'icon', 'createdAt'],
  'budgets.csv': ['id', 'month', 'category', 'limitAmount', 'currency', 'createdAt'],
};

/** What the date-shaped columns mean, said in the file as well as here. */
const DATE_SHAPES = {
  date: 'YYYY-MM-DD (a calendar day, UTC midnight)',
  month: 'YYYY-MM (a calendar month; the app keys a month by its first day)',
  createdAt: 'ISO-8601 instant in UTC (a moment, not a day)',
  updatedAt: 'ISO-8601 instant in UTC (a moment, not a day)',
};

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function failed(code) {
  const err = new Error(`export ${code}`);
  err.status = 500;
  return err;
}

/**
 * The one sentence a download link can fail with, for every reason: no such
 * job, wrong token, already used, expired, or the file has gone. A stranger
 * holding a link learns nothing about which of those it was, and a person
 * whose link timed out is not told anything about anyone else's account.
 */
const DOWNLOAD_GONE = 'That download link is not valid any more.';

/* --------------------------------- the folder -------------------------------- */

/** Where archives are written. Outside the web root, always. */
export function exportRoot() {
  return process.env.EXPORT_TMP_DIR || path.join(os.tmpdir(), 'campuscoin-exports');
}

async function ensureRoot() {
  const dir = exportRoot();
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

/* --------------------------------- the token --------------------------------- */

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

/**
 * A fresh single-use link.
 *
 * 32 bytes from the cryptographic source, base64url so it survives being typed
 * into a browser address bar, and only the SHA-256 is kept. Issuing a new link
 * REPLACES the old hash, so "the newest link is the only one that works" is a
 * property of the row rather than a rule a reader has to remember.
 */
export async function issueDownloadToken(job) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
  await DataExport.updateOne(
    { _id: job._id },
    {
      $set: {
        tokenHash: sha256(token),
        tokenExpiresAt: expiresAt,
        tokenIssuedAt: new Date(),
        tokenUsedAt: null,
      },
    }
  );
  return { token, expiresAt };
}

/**
 * Spend a link, or explain that it cannot be spent.
 *
 * The comparison is `timingSafeEqual` over two 32-byte buffers built from the
 * hex digests, so the lengths always match and the running time does not
 * depend on how many leading characters were right. When there is no stored
 * hash at all the compare still runs, against a buffer of the same size, so
 * "this job never had a link" is not measurably faster than "wrong link".
 *
 * The spend itself is one atomic `findOneAndUpdate` whose filter requires
 * `tokenUsedAt: null` and the exact hash. Two requests with the same link race
 * and exactly one wins; the loser gets the same 404 a stranger would. The hash
 * and the expiry are `$unset` in the same write, so a spent link leaves nothing
 * behind to be replayed from.
 */
export async function openDownload(jobId, rawToken) {
  const job = await DataExport.findById(jobId).select('+filePath +tokenHash +tokenExpiresAt +tokenUsedAt');
  if (!job) throw notFound(DOWNLOAD_GONE);

  const sent = Buffer.from(sha256(rawToken), 'hex');
  const stored = job.tokenHash ? Buffer.from(job.tokenHash, 'hex') : Buffer.alloc(32);
  if (sent.length !== stored.length || !crypto.timingSafeEqual(stored, sent)) {
    throw notFound(DOWNLOAD_GONE);
  }
  if (job.tokenUsedAt) throw notFound(DOWNLOAD_GONE);
  if (!job.tokenExpiresAt || job.tokenExpiresAt.getTime() <= Date.now()) throw notFound(DOWNLOAD_GONE);
  if (job.status !== 'ready' || !job.filePath) throw notFound(DOWNLOAD_GONE);

  const spent = await DataExport.findOneAndUpdate(
    { _id: job._id, tokenHash: job.tokenHash, tokenUsedAt: null },
    { $set: { tokenUsedAt: new Date() }, $unset: { tokenHash: 1, tokenExpiresAt: 1 } },
    { new: true }
  ).select('+filePath');
  if (!spent) throw notFound(DOWNLOAD_GONE);

  // Repair on read: a job whose file the OS has cleaned up is marked expired
  // rather than left pointing at nothing.
  let stat;
  try {
    stat = await fs.promises.stat(spent.filePath);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    await expireJob(spent);
    throw notFound(DOWNLOAD_GONE);
  }

  return { job: spent, path: spent.filePath };
}

/* --------------------------------- the job ---------------------------------- */

/**
 * Start a job, or hand back the one already in flight.
 *
 * The answer is immediate because the generation is NOT inline: a student with
 * four years of entries would sit on a spinner for a minute and press the
 * button again. So this writes one row and schedules the work on a timer, and
 * the response is flushed long before the first database read of the archive.
 *
 * Pressing the button twice gives the same job rather than two archives: while
 * one is queued or running, that one is what the next press gets. A job that
 * has been `running` for more than fifteen minutes was interrupted by a
 * restart rather than still working, so it is retired and a new one starts.
 */
export async function startExport(user) {
  // Fire and forget on purpose: the response must never wait on a directory
  // listing, and a sweep that throws must not fail somebody's export.
  sweepStaleArchives().catch(() => {});

  const now = new Date();
  const open = await DataExport.findOne({ user: user._id, status: { $in: ['queued', 'running'] } });
  if (open) {
    const stale = open.status === 'running' && open.startedAt && now - open.startedAt > STALE_RUN_MS;
    if (!stale) return { job: open.toPublic(), reused: true };
    await DataExport.updateOne(
      { _id: open._id },
      { $set: { status: 'failed', errorCode: 'interrupted', finishedAt: now } }
    );
  }

  const job = await DataExport.create({ user: user._id, status: 'queued', requestedAt: now });
  // NOT awaited, and that is the whole point: the timer callback runs after the
  // response has been written, so the POST returns while the archive is still
  // being built. The .catch keeps an unhandled rejection off the process if the
  // build fails - the job row has already recorded `failed` by then.
  setImmediate(() => {
    runExportJob(job._id).catch(() => {});
  });
  return { job: job.toPublic(), reused: false };
}

/** One job's status. Somebody else's job id is a 404, never a 403. */
export async function readJob(user, jobId) {
  const job = await DataExport.findOne({ _id: jobId, user: user._id });
  if (!job) throw notFound('That export does not exist.');
  return job;
}

/**
 * Status plus, when there is something to download, a fresh single-use link.
 * A link is issued on EVERY read of a ready job rather than stored, so the
 * "link works once" wording is true of the newest link and the card can always
 * re-arm itself without a second endpoint.
 */
export async function jobStatus(user, jobId) {
  const job = await readJob(user, jobId);
  if (job.status !== 'ready') return { job: job.toPublic(), download: null };

  const { token, expiresAt } = await issueDownloadToken(job);
  return {
    job: job.toPublic(),
    download: {
      url: `/api/export/${job._id.toString()}/download?token=${encodeURIComponent(token)}`,
      expiresAt,
      // restated here so a screen never has to remember the number
      expiresInHours: Math.round(EXPORT_TTL_MS / (60 * 60 * 1000)),
    },
  };
}

/** The account's own exports, newest first, for the card's list. */
export async function listExports(user, limit = 5) {
  const rows = await DataExport.find({ user: user._id }).sort({ requestedAt: -1 }).limit(limit);
  return rows.map((row) => row.toPublic());
}

/* ------------------------------- the generation ----------------------------- */

/**
 * Build the archive. Called by the timer, and called directly by the tests.
 *
 * The claim is one `findOneAndUpdate` on `status: 'queued'`, so two schedulers
 * (or a restart replaying a timer) cannot both build the same file: the second
 * finds nothing to claim and returns. Every failure ends in `failed` with a
 * MACHINE code, never a message - the screen writes the words.
 */
export async function runExportJob(jobId) {
  const job = await DataExport.findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
    { new: true }
  );
  if (!job) return null;

  let dir;
  try {
    const user = await User.findById(job.user);
    if (!user) throw failed('no_account');

    const currency = (user.ledgerCurrency || user.currency || 'USD').toUpperCase();
    const files = await readArchive(user, currency);
    dir = await ensureRoot();
    const target = path.join(dir, `${job._id.toString()}.zip`);
    const bytes = await writeZip(target, files);

    const counts = files.__counts;
    delete files.__counts;

    await DataExport.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'ready',
          filePath: target,
          fileName: `campuscoin-data-${stamp(job.requestedAt)}-${job._id.toString().slice(-8)}.zip`,
          bytes,
          currency,
          counts,
          finishedAt: new Date(),
          errorCode: null,
        },
      }
    );
    return { path: target, bytes };
  } catch (err) {
    await DataExport.updateOne(
      { _id: job._id },
      { $set: { status: 'failed', errorCode: 'build_failed', finishedAt: new Date() } }
    ).catch(() => {});
    if (dir) await fs.promises.rm(path.join(dir, `${job._id.toString()}.zip`), { force: true }).catch(() => {});
    throw err;
  }
}

/* --------------------------------- the CSV ---------------------------------- */

/** RFC 4180 quoting, plus the one rule the importer taught us. */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  // A cell a spreadsheet would run: "=1+1" and friends become text. The importer
  // neutralises these on the way IN; an export is a file people forward to
  // each other, so it neutralises them on the way OUT too.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRows(columns, rows) {
  return [columns.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n') + '\n';
}

/** Two decimals, unformatted - a thousands separator in a CSV cell is a string. */
function amount(value) {
  const n = toNum(value);
  return (n === null || n === undefined ? 0 : n).toFixed(2);
}

function isoInstant(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** The calendar day, in UTC, the way this app stores one. */
function day(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** The calendar month, the way a budget is keyed. */
function month(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 7);
}

function stamp(value) {
  return day(value).replace(/-/g, '') || 'export';
}

/** Names for every id in one round trip, so a row never shows a raw ObjectId. */
async function nameMap(ids, model) {
  const wanted = [...new Set(ids.filter(Boolean).map(String))];
  if (wanted.length === 0) return new Map();
  const rows = await model.find({ _id: { $in: wanted } }).select('name');
  return new Map(rows.map((row) => [String(row._id), row.name || '']));
}

/**
 * Read everything the four files contain. The bin is read with everything
 * else, and the wallet name is resolved here so a deleted wallet cannot leave
 * an id in a column a person is meant to read.
 *
 * All of it is loaded into memory at once, which is a deliberate trade and the
 * right one at this size: a student's four years of entries is tens of thousands
 * of small documents, and a cursor would make the code twice as long to save a
 * few megabytes on a machine that is already building a ZIP of the same data.
 * It also runs off the request path, so the memory is a background job's
 * memory and not anybody's HTTP timeout.
 */
async function readArchive(user, currency) {
  const userId = user._id;
  const transactions = await Transaction.find({ user: userId }).sort({ date: 1, createdAt: 1 });
  const personal = await Category.find({ user: userId }).sort({ type: 1, name: 1 });
  const budgets = await Budget.find({ user: userId }).sort({ month: 1, _id: 1 });
  const wallets = await Wallet.find({ user: userId }).select('name');

  const categoryIds = [
    ...transactions.map((row) => row.category),
    ...budgets.map((row) => row.category),
  ];
  const categoryNames = await nameMap(categoryIds, Category);
  const walletNames = new Map(wallets.map((row) => [String(row._id), row.name || '']));

  // The categories file is this person's own PLUS every category one of their
  // transactions points at - including the app's shared defaults. A CSV whose
  // amount rows name a category that is in no other file cannot be checked
  // against anything, and the shared defaults are what a student would have to
  // guess at when restoring into a new account.
  const wanted = new Set([...personal.map((row) => String(row._id)), ...categoryIds.map(String)]);
  const categories = wanted.size
    ? await Category.find({ _id: { $in: [...wanted] } }).sort({ type: 1, name: 1 })
    : [];

  const deletedCount = transactions.filter((row) => row.isDeleted).length;

  const transactionCsv = csvRows(EXPORT_COLUMNS['transactions.csv'], transactions.map((row) => [
    row._id.toString(),
    day(row.date),
    row.type,
    amount(row.amount),
    currency,
    categoryNames.get(String(row.category)) || '',
    row.description || '',
    row.wallet ? walletNames.get(String(row.wallet)) || '' : '',
    // a row in the bin, not a row that never existed
    row.isDeleted ? 'true' : 'false',
    row.flag || 'none',
    row.recurringRule ? row.recurringRule.toString() : '',
    isoInstant(row.createdAt),
    isoInstant(row.updatedAt),
  ]));

  const categoryCsv = csvRows(EXPORT_COLUMNS['categories.csv'], categories.map((row) => [
    row._id.toString(),
    row.name || '',
    row.type,
    row.isDefault ? 'true' : 'false',
    row.isActive ? 'true' : 'false',
    row.icon || '',
    isoInstant(row.createdAt),
  ]));

  const budgetCsv = csvRows(EXPORT_COLUMNS['budgets.csv'], budgets.map((row) => [
    row._id.toString(),
    month(row.month),
    categoryNames.get(String(row.category)) || '',
    amount(row.limitAmount),
    currency,
    isoInstant(row.createdAt),
  ]));

  return {
    'transactions.csv': transactionCsv,
    'categories.csv': categoryCsv,
    'budgets.csv': budgetCsv,
    'profile.json': `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        account: {
          name: user.name,
          email: user.email,
          recoveryEmail: user.recoveryEmail,
          academicYear: user.academicYear || '',
          language: user.language || 'en',
        },

        /**
         * The one field this file exists to be unambiguous about. The amounts in
         * the three CSVs are the STORED ones, unconverted, in the currency this
         * ledger is kept in - which is not necessarily the currency the app was
         * displaying. A spreadsheet will happily add a converted column to
         * those numbers; nothing here is.
         */
        currency,
        currencyField: 'ledgerCurrency',
        currencyNote:
          `Every amount in transactions.csv and budgets.csv is in ${currency}, the currency this ` +
          'ledger is kept in. Nothing here is converted, and this is not the currency the app was ' +
          'displaying: if you were reading the app somewhere else, these are the stored numbers.',

        amounts: 'Two decimal places, always positive. The sign is the type column: income or expense.',
        deletedEntries:
          'A transactions.csv row with isDeleted=true is in the bin, not gone. It is here so a ' +
          'restore can put it back and so the file can prove a delete really happened.',
        dateShapes: DATE_SHAPES,
        columns: EXPORT_COLUMNS,
        files: Object.keys(EXPORT_COLUMNS).concat(['profile.json']),
        counts: {
          transactions: transactions.length,
          deleted: deletedCount,
          categories: categories.length,
          budgets: budgets.length,
        },
      },
      null,
      2
    )}\n`,
    __counts: {
      transactions: transactions.length,
      categories: categories.length,
      budgets: budgets.length,
      deleted: deletedCount,
    },
  };
}

/* --------------------------------- the ZIP ---------------------------------- */

/**
 * Write the archive. `yazl` is a write-only ZIP writer: it is the one piece of
 * this feature that has to be a real library, because a hand-rolled writer gets
 * the CRC or the central directory wrong and produces a file no unzip tool will
 * open - which is the worst possible failure for a backup.
 */
function writeZip(target, files) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const out = fs.createWriteStream(target);
    zip.outputStream.on('error', reject);
    out.on('error', reject);
    out.on('close', () => resolve(out.bytesWritten));
    zip.outputStream.pipe(out);
    for (const [name, text] of Object.entries(files)) {
      if (name.startsWith('__')) continue; // the counts ride home separately
      zip.addBuffer(Buffer.from(String(text), 'utf8'), name);
    }
    zip.end();
  });
}

/* --------------------------------- the sweep -------------------------------- */

/** Mark a job whose archive is gone, so the card stops offering a dead link. */
export async function expireJob(job) {
  await DataExport.updateOne(
    { _id: job._id },
    {
      $set: { status: 'failed', errorCode: 'expired', finishedAt: new Date() },
      $unset: { filePath: 1, tokenHash: 1, tokenExpiresAt: 1, bytes: 1 },
    }
  );
}

/**
 * Remove every archive past its 24 hours, and everything left over from a
 * crash. Exported so a script or a scheduler can call it on its own; the router
 * also fires it on every new job.
 *
 * Two passes, because they fail differently: the rows first, so a job whose file
 * has gone says so, and the folder afterwards, so a file whose row never landed
 * (a restart between the write and the update) still cannot sit on the disk
 * holding somebody's spending history.
 */
export async function sweepStaleArchives({ now = Date.now() } = {}) {
  const dir = await ensureRoot();
  const cutoff = new Date(now - EXPORT_TTL_MS);

  const stale = await DataExport.find({
    filePath: { $ne: null },
    finishedAt: { $lt: cutoff },
  }).select('+filePath');

  const gone = [];
  for (const job of stale) {
    if (job.filePath) await fs.promises.rm(job.filePath, { force: true }).catch(() => {});
    gone.push(job._id);
  }
  if (gone.length) {
    await DataExport.updateMany(
      { _id: { $in: gone } },
      {
        $set: { status: 'failed', errorCode: 'expired', finishedAt: new Date(now) },
        $unset: { filePath: 1, tokenHash: 1, tokenExpiresAt: 1, bytes: 1 },
      }
    );
  }

  let orphans = 0;
  for (const name of await fs.promises.readdir(dir)) {
    if (!name.endsWith('.zip')) continue;
    const full = path.join(dir, name);
    const stat = await fs.promises.stat(full).catch(() => null);
    if (!stat?.isFile()) continue;
    if (stat.mtime >= cutoff) continue;
    const row = await DataExport.exists({ filePath: full });
    if (row) continue;
    await fs.promises.rm(full, { force: true }).catch(() => {});
    orphans += 1;
  }

  return { removed: gone.length, orphans };
}
