import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';
import { parseCsv, templateCsv, validateRows, neutralise, fileProblem } from '../src/services/importer.js';

let ctx;
let newAgent;
let food;
let allowance;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
  allowance = await makeDefaultCategory({ name: 'Allowance', type: 'income', icon: 'wallet' });
});

test.after(async () => {
  await ctx.stop();
});

/* -------------------------------- the parser -------------------------------- */

test('parses quoted fields, escaped quotes and mixed line endings', () => {
  const rows = parseCsv('date,type,category,amount,description\r\n2026-09-01,expense,Food,4.50,"Lunch, with ""extra"" napkins"\n\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['2026-09-01', 'expense', 'Food', '4.50', 'Lunch, with "extra" napkins']);
});

test('the template starts with the required header and one example row', () => {
  const lines = templateCsv().trim().split('\n');
  assert.equal(lines[0], 'date,type,category,amount,description');
  assert.equal(lines.length, 3);
});

test('cells that look like formulas are neutralised when echoed back', () => {
  assert.equal(neutralise('=1+1'), "'=1+1");
  assert.equal(neutralise('@cmd'), "'@cmd");
  assert.equal(neutralise('hello'), 'hello');
});

test('the upload guard rejects wrong extensions, oversized and binary files', () => {
  assert.ok(fileProblem(null));
  assert.ok(fileProblem({ originalname: 'sheet.xlsx', size: 10 }));
  assert.ok(fileProblem({ originalname: 'big.csv', size: 2 * 1024 * 1024 }));
  assert.ok(fileProblem({ originalname: 'weird.csv', size: 10, buffer: Buffer.from([0x00, 0x01]) }));
  assert.equal(fileProblem({ originalname: 'ok.csv', size: 100, buffer: Buffer.from('a,b') }), null);
});

/* ------------------------------ row validation ------------------------------ */

test('problems are reported per row instead of failing the whole file', async () => {
  const agent = newAgent();
  await registerStudent(agent);

  const parsed = parseCsv(
    [
      'date,type,category,amount,description',
      '2026-09-01,expense,Food,4.50,Good row',
      '2026-13-45,expense,Food,4.50,Bad date',
      '2026-09-02,expense,Food,zero,Bad amount',
      '2026-09-03,expense,Rockets,5.00,Unknown category',
      '2026-09-04,whatever,Food,5.00,Bad type',
    ].join('\n')
  );

  const { errors, rows } = await validateRows({ _id: (await currentUser(agent)).id }, parsed);
  assert.equal(rows.length, 1, 'only the good row is accepted');
  assert.equal(errors.length, 4);
  assert.ok(errors.every((e) => e.line >= 3 && e.line <= 6), 'errors point at their own line');
});

async function currentUser(agent) {
  const me = await agent.get('/api/auth/me');
  return me.body.user;
}

/* --------------------------- the preview + confirm -------------------------- */

test('upload → preview → confirm imports only the accepted rows', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);

  const csv = [
    'date,type,category,amount,description',
    `2026-09-01,income,Allowance,600.00,Monthly allowance`,
    `2026-09-02,expense,Food,4.50,Campus cafe lunch`,
    `2026-09-03,expense,Food,broken,Broken row`,
  ].join('\n');

  const preview = await withCsrf(user, agent.post('/api/transactions/import/preview'))
    .attach('file', Buffer.from(csv, 'utf8'), 'history.csv');
  assert.equal(preview.status, 200);
  assert.equal(preview.body.ready, 2);
  assert.equal(preview.body.problems, 1);
  assert.equal(preview.body.errors[0].line, 4);

  const confirmed = await withCsrf(user, agent.post('/api/transactions/import/confirm')).send({
    rows: preview.body.rows,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.imported, 2);

  const list = await agent.get('/api/transactions');
  assert.equal(list.body.rows.length, 2);
  assert.equal(list.body.totals.income, 600);
  assert.equal(list.body.totals.expense, 4.5);
});

test('the preview endpoint refuses files that are not csv', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);

  const bad = await withCsrf(user, agent.post('/api/transactions/import/preview'))
    .attach('file', Buffer.from('whatever'), 'notes.txt');
  assert.equal(bad.status, 400);
});

test('confirm re-validates rows and never trusts the browser', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);

  const tampered = await withCsrf(user, agent.post('/api/transactions/import/confirm')).send({
    rows: [{ date: '2026-09-01', type: 'expense', category: 'Food', amount: '0.00', description: 'nope', categoryId: food._id.toString() }],
  });
  assert.equal(tampered.status, 400, 'a zero amount slipped past the browser and must still be refused');

  const valid = await withCsrf(user, agent.post('/api/transactions/import/confirm')).send({
    rows: [{ date: '2026-09-01', type: 'income', category: 'Allowance', amount: '25.00', description: 'odd job', categoryId: allowance._id.toString() }],
  });
  assert.equal(valid.body.imported, 1);
});
