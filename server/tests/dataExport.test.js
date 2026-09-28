import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';

import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';
import exportRoutes from '../src/routes/dataExport.js';
import DataExport from '../src/models/DataExport.js';
import Transaction from '../src/models/Transaction.js';
import Category from '../src/models/Category.js';
import Budget from '../src/models/Budget.js';
import { toDec } from '../src/utils/money.js';
import { monthStart } from '../src/models/Budget.js';
import { EXPORT_TTL_MS, EXPORT_COLUMNS, sha256, sweepStaleArchives } from '../src/services/dataExport.js';

/**
 * "Download my data" (NEW-1).
 *
 * The harness is the one from groupLedger.test.js: an in-memory database, real
 * sign-ups, real sessions, the CSRF header on every write. The export router is
 * mounted by THIS file, in front of the /api 404 layer, so the suite stands on
 * its own without app.js having heard of the route.
 *
 * Three things here are worth more than the rest, and each has a test named
 * after it:
 *
 *   - THE FILE. The archive is opened and read back, because every other test
 *     in this project would have been happy with a job that said "ready" and a
 *     ZIP that contained nothing useful.
 *   - THE BIN. A deleted row has to be in transactions.csv with isDeleted=true.
 *   - THE LINK. A stranger holding the URL gets the file exactly once. That is
 *     the whole security argument for a public download route, and "exactly
 *     once" has to be tested with a real second request, not asserted.
 */

let ctx;
let exportRoot;

test.before(async () => {
  // Archives are written outside the web root, into the OS temp folder. The
  // folder is set explicitly rather than inherited so the suite writes
  // somewhere it can clean up after itself.
  exportRoot = path.join(os.tmpdir(), `cc-export-test-${process.pid}`);
  process.env.EXPORT_TMP_DIR = exportRoot;
  await fs.promises.mkdir(exportRoot, { recursive: true });

  ctx = await startApp();
  mountExport(ctx.app);
});

test.after(async () => {
  await ctx.stop();
  await fs.promises.rm(exportRoot, { recursive: true, force: true }).catch(() => {});
});

/** The export router is mounted by src/app.js; mount it only if it is not. */
function mountExport(app) {
  const stack = app._router || app.router;
  if (!stack) throw new Error('cannot find the express router stack');

  app.use('/api/export', exportRoutes);
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/* -------------------------------- fixtures --------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function session(payload = {}) {
  const agent = ctx.newAgent();
  const account = await registerStudent(agent, payload);
  return { agent, ...account };
}

/** Start a job and wait for it to stop moving. */
async function build(who) {
  const start = await withCsrf(who, who.agent.post('/api/export')).send({});
  assert.equal(start.status, 202, start.text);
  assert.equal(start.body.job.status, 'queued', 'a new job starts queued, not running');

  for (let i = 0; i < 200; i += 1) {
    const res = await who.agent.get(`/api/export/${start.body.job.id}`);
    assert.equal(res.status, 200, res.text);
    if (res.body.job.status === 'ready' || res.body.job.status === 'failed') return res;
    await sleep(25);
  }
  throw new Error('the export never finished');
}

/**
 * A default category, with a name no other test has used. The default set is
 * guarded by a unique index on (nameKey, type), so two tests both asking for
 * "Food" is a duplicate key error rather than a shared fixture.
 */
let categorySeq = 0;
async function defaultCategory(label, type = 'expense') {
  categorySeq += 1;
  return makeDefaultCategory({ name: `${label} ${categorySeq}`, type });
}

/** A small ledger: two entries, one in the bin, a personal category, a budget. */
async function seedLedger(who) {
  const food = await defaultCategory('Food');
  const own = await Category.create({
    user: who.user.id,
    name: 'Coffee',
    nameKey: 'coffee',
    type: 'expense',
    icon: 'cup',
  });

  const keep = await Transaction.create({
    user: who.user.id,
    category: food._id,
    amount: toDec('120.50'),
    type: 'expense',
    description: 'weekly grocery run',
    date: new Date('2026-03-04T00:00:00.000Z'),
  });
  const binned = await Transaction.create({
    user: who.user.id,
    category: own._id,
    amount: toDec('3.25'),
    type: 'expense',
    description: 'coffee',
    date: new Date('2026-03-05T00:00:00.000Z'),
  });
  // soft delete, the way the app's own delete button does it
  await Transaction.updateOne({ _id: binned._id }, { $set: { isDeleted: true } });

  const budget = await Budget.create({
    user: who.user.id,
    category: food._id,
    month: monthStart(new Date('2026-03-15T00:00:00.000Z')),
    limitAmount: toDec('300.00'),
  });

  return { food, own, keep, binned, budget };
}

/** Read a binary body out of a supertest response. */
function binary(req) {
  return req
    .buffer()
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
}

/** Open the archive and give back its four files, by name. */
function unzip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const files = {};
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (openErr, stream) => {
          if (openErr) return reject(openErr);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            files[entry.fileName] = Buffer.concat(chunks).toString('utf8');
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

const rows = (csv) => csv.trim().split('\n');
const cells = (line) => {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
};

/* --------------------------------- the job ---------------------------------- */

test('POST /api/export answers immediately with a queued job, not a finished one', async () => {
  const who = await session();
  const res = await withCsrf(who, who.agent.post('/api/export')).send({});

  assert.equal(res.status, 202);
  assert.equal(res.body.job.status, 'queued');
  assert.ok(res.body.job.id, 'the job has an id to poll');
  assert.deepEqual(
    res.body.job.counts,
    { transactions: 0, categories: 0, budgets: 0, deleted: 0 },
    'nothing has been read yet, so nothing has been counted'
  );
  assert.equal(res.body.download, undefined, 'there is no link before there is a file');
});

test('pressing the button twice gives the same job, not two archives', async () => {
  const who = await session();
  const first = await withCsrf(who, who.agent.post('/api/export')).send({});
  const second = await withCsrf(who, who.agent.post('/api/export')).send({});

  assert.equal(second.body.job.id, first.body.job.id);
  assert.equal(second.body.reused, true);
});

test('a write without the CSRF header is refused', async () => {
  const who = await session();
  const res = await who.agent.post('/api/export').send({});
  assert.equal(res.status, 403);
});

test('GET /api/export lists only this account\'s jobs', async () => {
  const a = await session();
  const b = await session();
  await build(a);
  await build(b);

  const mine = await a.agent.get('/api/export');
  const theirs = await b.agent.get('/api/export');
  assert.ok(mine.body.jobs.length >= 1);
  assert.ok(theirs.body.jobs.length >= 1);
  const aIds = new Set(mine.body.jobs.map((row) => row.id));
  for (const row of theirs.body.jobs) assert.equal(aIds.has(row.id), false);
});

/* -------------------------------- the archive ------------------------------- */

test('the archive opens, and holds exactly the four files the brief names', async () => {
  const who = await session();
  const ready = await build(who);
  assert.equal(ready.body.job.status, 'ready', JSON.stringify(ready.body));

  const res = await binary(who.agent.get(ready.body.download.url));
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/zip');
  assert.equal(res.body.subarray(0, 2).toString('latin1'), 'PK', 'a real zip signature');
  assert.match(String(res.headers['content-disposition']), /attachment; filename="campuscoin-data-\d{8}-[0-9a-f]{8}\.zip"/);

  const files = await unzip(res.body);
  assert.deepEqual(
    Object.keys(files).sort(),
    ['budgets.csv', 'categories.csv', 'profile.json', 'transactions.csv']
  );
});

test('the archive is written outside the web root, and its name is the job id', async () => {
  const who = await session();
  const ready = await build(who);
  const row = await DataExport.findById(ready.body.job.id).select('+filePath');

  assert.ok(path.isAbsolute(row.filePath), 'an absolute path, not a route');
  assert.equal(path.dirname(row.filePath), exportRoot);
  assert.equal(path.basename(row.filePath), `${ready.body.job.id}.zip`);
  assert.equal(
    row.filePath.includes(`${path.sep}client${path.sep}dist`),
    false,
    'never inside the folder Express serves as the web root'
  );
  assert.ok(fs.existsSync(row.filePath), 'and it is really there');
});

test('every CSV starts with the stated header row, and profile.json states the columns', async () => {
  const who = await session();
  await seedLedger(who);
  const ready = await build(who);
  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);
  const profile = JSON.parse(files['profile.json']);

  for (const [name, columns] of Object.entries(EXPORT_COLUMNS)) {
    assert.deepEqual(rows(files[name])[0].split(','), columns, `${name} header row`);
    assert.deepEqual(profile.columns[name], columns, `${name} is described in profile.json`);
  }
  // and the file actually has data rows, not just a header
  assert.ok(rows(files['transactions.csv']).length > 1);
  assert.ok(rows(files['categories.csv']).length > 1);
  assert.ok(rows(files['budgets.csv']).length > 1);
});

test('a deleted entry is IN the file, marked, not quietly left out', async () => {
  const who = await session();
  const { keep, binned } = await seedLedger(who);
  const ready = await build(who);
  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);

  const lines = rows(files['transactions.csv']);
  const head = lines[0].split(',');
  const at = (name) => head.indexOf(name);
  const body = lines.slice(1).map(cells);

  const kept = body.find((row) => row[at('id')] === keep._id.toString());
  const gone = body.find((row) => row[at('id')] === binned._id.toString());

  assert.ok(kept, 'the live entry is in the file');
  assert.ok(gone, 'the entry in the bin is in the file too - a backup that omits the bin is not a backup');
  assert.equal(kept[at('isDeleted')], 'false');
  assert.equal(gone[at('isDeleted')], 'true');
  assert.equal(ready.body.job.counts.deleted, 1);
});

test('the dates in a CSV are YYYY-MM-DD, and a month key is YYYY-MM', async () => {
  const who = await session();
  await seedLedger(who);
  const ready = await build(who);
  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);

  const txn = rows(files['transactions.csv'])[0].split(',');
  const line = cells(rows(files['transactions.csv'])[1]);
  assert.match(line[txn.indexOf('date')], /^\d{4}-\d{2}-\d{2}$/);
  assert.match(line[txn.indexOf('createdAt')], /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);

  const bud = rows(files['budgets.csv'])[0].split(',');
  const budget = cells(rows(files['budgets.csv'])[1]);
  assert.match(budget[bud.indexOf('month')], /^\d{4}-\d{2}$/);
});

test('amounts are in the ledger currency, and profile.json says which', async () => {
  // a student who displays in one currency and keeps the ledger in another
  const who = await session({ name: 'Ruqayyah' });
  await withCsrf(who, who.agent.patch('/api/auth/me/preferences')).send({ currency: 'USD', ledgerCurrency: 'PKR' });
  await seedLedger(who);

  const ready = await build(who);
  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);
  const profile = JSON.parse(files['profile.json']);

  assert.equal(ready.body.job.currency, 'PKR');
  assert.equal(profile.currency, 'PKR', 'the currency is a field of its own');
  assert.match(profile.currencyNote, /PKR/, 'and the file says so in words');
  assert.equal(profile.currencyField, 'ledgerCurrency');

  // every money row carries the code, so a CSV opened on its own cannot be
  // misread as dollars
  const head = rows(files['transactions.csv'])[0].split(',');
  for (const line of rows(files['transactions.csv']).slice(1)) {
    const row = cells(line);
    assert.equal(row[head.indexOf('currency')], 'PKR');
    assert.match(row[head.indexOf('amount')], /^\d+\.\d{2}$/);
  }
  const budHead = rows(files['budgets.csv'])[0].split(',');
  const budget = cells(rows(files['budgets.csv'])[1]);
  assert.equal(budget[budHead.indexOf('currency')], 'PKR');
  assert.equal(budget[budHead.indexOf('limitAmount')], '300.00');
});

test('a spreadsheet formula in a description is neutralised on the way out', async () => {
  const who = await session();
  const food = await defaultCategory('Shopping');
  await Transaction.create({
    user: who.user.id,
    category: food._id,
    amount: toDec('10.00'),
    type: 'expense',
    description: '=HYPERLINK("http://elsewhere.test","click")',
    date: new Date('2026-04-01T00:00:00.000Z'),
  });

  const ready = await build(who);
  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);
  const raw = rows(files['transactions.csv'])[1];
  const head = rows(files['transactions.csv'])[0].split(',');
  const parsed = cells(raw);

  assert.match(parsed[head.indexOf('description')], /^'=HYPERLINK\(/, 'the leading = is defused');
  assert.match(raw, /""http:\/\/elsewhere\.test""/, 'and the embedded quotes were doubled for the CSV');
  assert.match(parsed[head.indexOf('description')], /"click"/, 'the text itself is untouched');
});

test('a description with a comma survives the round trip', async () => {
  const who = await session();
  const food = await defaultCategory('Travel');
  await Transaction.create({
    user: who.user.id,
    category: food._id,
    amount: toDec('55.00'),
    type: 'expense',
    description: 'bus, train, then a taxi',
    date: new Date('2026-04-02T00:00:00.000Z'),
  });

  const ready = await build(who);
  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);
  const head = rows(files['transactions.csv'])[0].split(',');
  const row = cells(rows(files['transactions.csv'])[1]);
  assert.equal(row[head.indexOf('description')], 'bus, train, then a taxi');
});

/* --------------------------------- the link --------------------------------- */

test('a ready job comes with a single-use link that expires in exactly 24 hours', async () => {
  const who = await session();
  const before = Date.now();
  const ready = await build(who);

  assert.ok(ready.body.download.url, 'a link is handed out when the job is ready');
  assert.match(ready.body.download.url, /\?token=[A-Za-z0-9_-]{43}$/, '256 bits, base64url');
  assert.equal(ready.body.download.expiresInHours, 24);

  const expires = new Date(ready.body.download.expiresAt).getTime();
  assert.ok(expires - before >= EXPORT_TTL_MS - 5000, 'no earlier than 24 hours out');
  assert.ok(expires - before <= EXPORT_TTL_MS + 20000, 'and no later than 24 hours out');
});

test('only the hash of the link is stored, and the plain link is not in the row', async () => {
  const who = await session();
  const ready = await build(who);
  const token = new URL(ready.body.download.url, 'http://x').searchParams.get('token');

  const row = await DataExport.findById(ready.body.job.id).select('+tokenHash +tokenExpiresAt');
  assert.equal(row.tokenHash.length, 64);
  assert.equal(row.tokenHash, sha256(token));
  assert.notEqual(row.tokenHash, token);

  // and the field is invisible to a plain read, so no other query in the app
  // can pick a live link up by accident
  const plain = await DataExport.findById(ready.body.job.id);
  assert.equal(plain.tokenHash, undefined);
  assert.equal(plain.filePath, undefined);
});

test('THE LINK: a stranger gets the file once, and the same URL never works twice', async () => {
  const who = await session();
  await seedLedger(who);
  const ready = await build(who);
  const url = ready.body.download.url;

  // No session at all - the token is the only credential there is.
  const stranger = ctx.request(ctx.app);
  const first = await binary(stranger.get(url));
  assert.equal(first.status, 200, 'the link works once for whoever holds it');
  assert.equal(first.body.subarray(0, 2).toString('latin1'), 'PK');

  const second = await stranger.get(url);
  assert.equal(second.status, 404, 'and the same URL is dead the second time');
  assert.equal(second.body.error, 'That download link is not valid any more.');

  // the OWNER cannot get it back either: it is the token that is spent, not
  // the session
  const owner = await who.agent.get(url);
  assert.equal(owner.status, 404);
});

test('a new link is armed by reading the status again, and the old one stays dead', async () => {
  const who = await session();
  const first = await build(who);
  await binary(who.agent.get(first.body.download.url));

  const again = await who.agent.get(`/api/export/${first.body.job.id}`);
  assert.equal(again.status, 200);
  assert.notEqual(again.body.download.url, first.body.download.url);
  assert.equal((await binary(who.agent.get(again.body.download.url))).status, 200);
  assert.equal((await who.agent.get(first.body.download.url)).status, 404, 'the old one is still spent');
});

test('a wrong token, a job id that does not exist, and a stranger\'s job id all say the same thing', async () => {
  const who = await session();
  const ready = await build(who);
  const id = ready.body.job.id;

  const wrongToken = await ctx.request(ctx.app).get(`/api/export/${id}/download?token=not-a-real-token`);
  assert.equal(wrongToken.status, 404);

  const emptyToken = await ctx.request(ctx.app).get(`/api/export/${id}/download`);
  assert.equal(emptyToken.status, 404);

  const noJob = await ctx
    .request(ctx.app)
    .get('/api/export/64b7f2b4c0a4e5d6f7a8b9c0/download?token=whatever');
  assert.equal(noJob.status, 404);
  assert.equal(
    noJob.body.error,
    wrongToken.body.error,
    'a stranger learns nothing about which of those it was'
  );
});

test('a stranger\'s JOB id is a 404 on the status route, never a 403', async () => {
  const a = await session();
  const b = await session();
  const ready = await build(a);

  const res = await b.agent.get(`/api/export/${ready.body.job.id}`);
  assert.equal(res.status, 404, 'not 403: a 403 would confirm the job is real');
  assert.equal(res.body.error, 'That export does not exist.');
});

test('an expired link is refused, and the token it left behind cannot be replayed', async () => {
  const who = await session();
  const ready = await build(who);
  await DataExport.updateOne(
    { _id: ready.body.job.id },
    { $set: { tokenExpiresAt: new Date(Date.now() - 1000) } }
  );

  const res = await ctx.request(ctx.app).get(ready.body.download.url);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'That download link is not valid any more.');
});

test('a link for a job that is not ready is refused', async () => {
  const who = await session();
  const queued = await withCsrf(who, who.agent.post('/api/export')).send({});
  const row = await DataExport.findById(queued.body.job.id);
  await DataExport.updateOne(
    { _id: row._id },
    { $set: { tokenHash: sha256('made-up'), tokenExpiresAt: new Date(Date.now() + 60000) } }
  );

  const res = await ctx.request(ctx.app).get(`/api/export/${row._id}/download?token=made-up`);
  assert.equal(res.status, 404);
});

/* ------------------------------- the cleanup ------------------------------- */

test('the sweep removes an archive past 24 hours and says the job expired', async () => {
  const who = await session();
  const ready = await build(who);
  const row = await DataExport.findById(ready.body.job.id).select('+filePath');
  assert.ok(fs.existsSync(row.filePath));

  // the file is a day and a minute old, and so is the job that claims it
  await DataExport.updateOne(
    { _id: row._id },
    { $set: { finishedAt: new Date(Date.now() - EXPORT_TTL_MS - 60000) } }
  );
  const older = new Date(Date.now() - EXPORT_TTL_MS - 120000);
  await fs.promises.utimes(row.filePath, older, older);

  const swept = await sweepStaleArchives();
  assert.equal(swept.removed, 1);
  assert.equal(fs.existsSync(row.filePath), false, 'the file is gone from the disk');

  const after = await DataExport.findById(row._id);
  assert.equal(after.status, 'failed');
  assert.equal(after.errorCode, 'expired');
  assert.equal(after.filePath, undefined, 'and it does not point at nothing any more');
});

test('a fresh archive is left alone by the sweep', async () => {
  const who = await session();
  const ready = await build(who);
  const row = await DataExport.findById(ready.body.job.id).select('+filePath');

  const swept = await sweepStaleArchives();
  assert.equal(swept.removed, 0);
  assert.ok(fs.existsSync(row.filePath), 'a link still within its 24 hours is not thrown away');
});

test('a job whose file the OS cleaned up is marked expired instead of serving a dead link', async () => {
  const who = await session();
  const ready = await build(who);
  const row = await DataExport.findById(ready.body.job.id).select('+filePath');
  await fs.promises.rm(row.filePath, { force: true });

  const res = await ctx.request(ctx.app).get(ready.body.download.url);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'That download link is not valid any more.');

  const after = await DataExport.findById(row._id);
  assert.equal(after.status, 'failed');
  assert.equal(after.errorCode, 'expired');
});

/* --------------------------------- the jobs --------------------------------- */

test('an account with nothing in it still gets a readable archive', async () => {
  const who = await session();
  const ready = await build(who);
  assert.equal(ready.body.job.status, 'ready');

  const files = await unzip((await binary(who.agent.get(ready.body.download.url))).body);
  assert.equal(rows(files['transactions.csv']).length, 1, 'a header row and nothing else');
  assert.equal(rows(files['budgets.csv']).length, 1);
  const profile = JSON.parse(files['profile.json']);
  assert.equal(profile.counts.transactions, 0);
  assert.equal(profile.account.email, who.email);
});
