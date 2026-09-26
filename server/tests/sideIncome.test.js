import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf } from './helpers.js';

let ctx;
let newAgent; // a fresh cookie jar per call, straight off the harness
let admin; // { agent, csrf } — a signed-in administrator
let student; // { agent, csrf } — a signed-in student

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;

  admin = await signInAdmin();

  // The helper returns the session, not the agent, so the jar is kept here.
  const studentAgent = newAgent();
  student = { agent: studentAgent, ...(await registerStudent(studentAgent)) };
});

test.after(async () => {
  await ctx.stop();
});

/* --------------------------------- the doors ------------------------------- */

test('the public library answers with no session at all', async () => {
  const res = await newAgent().get('/api/side-income');

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.rows));
  assert.ok(res.body.pagination, 'the page count comes with the rows, in one read');
  assert.ok(res.body.stats, 'the counts above the grid come with it too');
  assert.match(res.body.disclaimer, /not a promise of income/i);
});

test('the admin door refuses a student (403) and an anonymous caller (401)', async () => {
  const asStudent = await withCsrf(student, student.agent.get('/api/control/side-income'));
  assert.equal(asStudent.status, 403);

  const asNobody = await newAgent().get('/api/control/side-income');
  assert.equal(asNobody.status, 401);

  // Creating is behind the same guard, not just reading.
  const write = await withCsrf(student, student.agent.post('/api/control/side-income')).send({
    title: 'Should never exist',
    category: 'freelance',
    summary: 'A student must not be able to publish an idea.',
  });
  assert.equal(write.status, 403);
});

/* ---------------------------------- writing -------------------------------- */

test('an administrator can add an idea and the public list shows it', async () => {
  const created = await addIdea({
    title: 'Library desk shifts',
    category: 'part-time',
    summary: 'Staffing the desk in the main library during the evening rush.',
    howItWorks: 'The library hires its own student desk assistants each term.',
    typicalEffort: 'One or two evenings a week',
    startupCost: 'None',
  });

  assert.equal(created.status, 201);
  assert.ok(created.body.idea.id);
  assert.equal(created.body.idea.isTrending, false);
  assert.equal(created.body.idea.sourceUrl, '', 'no source was given, so none is claimed');
  assert.equal(created.body.idea.isActive, true);

  const list = await newAgent().get('/api/side-income?q=Library%20desk%20shifts');
  assert.equal(list.status, 200);
  assert.equal(list.body.rows.length, 1);
  assert.equal(list.body.rows[0].id, created.body.idea.id);
  assert.equal(list.body.rows[0].category, 'part-time');
  assert.equal(list.body.pagination.total, 1);
});

test('the trending badge round-trips, and sorts trending rows first', async () => {
  const plain = await addIdea({
    title: 'Plain idea, never trending',
    category: 'services',
    summary: 'An ordinary entry that carries no trend claim at all.',
  });
  const hot = await addIdea({
    title: 'Trending idea with a note',
    category: 'reselling',
    summary: 'A second-hand textbook resale that is easy to start.',
    isTrending: true,
    sourceNote: 'Second-hand sales on the campus marketplace, spring term.',
  });
  assert.equal(hot.body.idea.isTrending, true);
  assert.equal(hot.body.idea.sourceNote, 'Second-hand sales on the campus marketplace, spring term.');

  const list = await newAgent().get('/api/side-income?perPage=100');
  const rows = list.body.rows;
  assert.ok(
    rows.findIndex((r) => r.id === hot.body.idea.id) < rows.findIndex((r) => r.id === plain.body.idea.id),
    'a trending row reads before a quiet one'
  );

  // And the flag can be taken off again, once the source is gone with it.
  const off = await patchIdea(hot.body.idea.id, { isTrending: false, sourceNote: '' });
  assert.equal(off.body.idea.isTrending, false);
  assert.equal(off.body.idea.sourceNote, '');
});

/* --------------------------- the citation rule ----------------------------- */

test('a trending idea without any source is refused, and one with a source is accepted', async () => {
  const noSource = await addIdea({
    title: 'Bare trend claim',
    category: 'freelance',
    summary: 'Nobody has written down where this came from.',
    isTrending: true,
  });
  assert.equal(noSource.status, 400);
  assert.match(noSource.body.error, /source/i, 'the message has to explain what is missing');
  assert.match(noSource.body.error, /trending/i);

  // A note is enough…
  const withNote = await addIdea({
    title: 'Trend claim with a note',
    category: 'freelance',
    summary: 'Named after the careers newsletter that reported it.',
    isTrending: true,
    sourceNote: 'Careers newsletter, March edition.',
  });
  assert.equal(withNote.status, 201);

  // …and so is a link.
  const withUrl = await addIdea({
    title: 'Trend claim with a link',
    category: 'freelance',
    summary: 'Linked straight to the survey it was read from.',
    isTrending: true,
    sourceUrl: 'https://campuscoin.test/reports/student-work-2026',
  });
  assert.equal(withUrl.status, 201);

  // Editing into an unsourced trending row fails the same way: the stored
  // badge plus a cleared source is still an unsourced badge.
  const cleared = await patchIdea(withUrl.body.idea.id, { sourceUrl: '' });
  assert.equal(cleared.status, 400);
  assert.match(cleared.body.error, /source/i);
});

test('a source link has to be a real web address when one is given', async () => {
  const broken = await addIdea({
    title: 'Idea with a broken citation',
    category: 'services',
    summary: 'The link is not an address at all.',
    sourceUrl: 'careers page',
  });
  assert.equal(broken.status, 400);
  assert.match(broken.body.error, /http/i);

  // Leaving the source out entirely is fine — only a present one is judged.
  const unsourced = await addIdea({
    title: 'Idea with no citation at all',
    category: 'services',
    summary: 'Not marked trending, so no source is demanded yet.',
  });
  assert.equal(unsourced.status, 201);
});

/* ---------------------------------- filters ------------------------------- */

test('the category, trending and search filters all narrow the list, and the facet total agrees', async () => {
  const marker = 'zzfilter';
  await addIdea({
    title: `${marker} first`,
    category: 'part-time',
    summary: 'Library cover shifts during the reading week.',
  });
  await addIdea({
    title: `${marker} second`,
    category: 'freelance',
    summary: 'Tutoring for the courses you already passed.',
    isTrending: true,
    sourceNote: 'Departmental newsletter listing paid tutoring hours.',
  });
  await addIdea({
    title: `${marker} third`,
    category: 'freelance',
    summary: 'Transcription work for the faculty podcast.',
  });

  const all = await newAgent().get(`/api/side-income?q=${marker}&perPage=100`);
  assert.equal(all.body.pagination.total, 3);
  assert.equal(all.body.rows.length, 3);

  const byCategory = await newAgent().get(`/api/side-income?category=freelance&q=${marker}&perPage=100`);
  assert.equal(byCategory.status, 200);
  assert.equal(byCategory.body.pagination.total, 2, 'the facet total counts the filtered rows, not the library');
  assert.ok(byCategory.body.rows.every((r) => r.category === 'freelance'));

  const byTrending = await newAgent().get(`/api/side-income?trending=true&q=${marker}&perPage=100`);
  assert.equal(byTrending.body.pagination.total, 1);
  assert.equal(byTrending.body.rows[0].isTrending, true);

  // A search word is escaped, not compiled: a bracket must not break it.
  const odd = await newAgent().get(`/api/side-income?q=${encodeURIComponent('[')}`);
  assert.equal(odd.status, 200);
  assert.equal(odd.body.pagination.total, 0);

  const unknown = await newAgent().get('/api/side-income?category=schemes');
  assert.equal(unknown.status, 400);
  assert.match(unknown.body.error, /part-time/);
});

test('the stats count every category and the trending rows', async () => {
  const res = await newAgent().get('/api/side-income?perPage=1');
  assert.equal(res.status, 200);

  const { stats } = res.body;
  assert.deepEqual(Object.keys(stats.byCategory).sort(), ['freelance', 'part-time', 'reselling', 'services']);
  assert.ok(stats.total >= 1);
  assert.ok(stats.trending >= 1);
  assert.ok(stats.trending <= stats.total, 'trending is a subset of the library');
});

/* ------------------------------ update + delete --------------------------- */

test('an idea can be edited and then removed, and a missing one answers 404', async () => {
  const made = await addIdea({
    title: 'Temporary idea',
    category: 'reselling',
    summary: 'Exists only until this test deletes it.',
    sortOrder: 7,
    icon: '📦',
  });

  const edited = await patchIdea(made.body.idea.id, {
    title: 'Temporary idea, renamed',
    sortOrder: 9,
    isTrending: true,
    sourceUrl: 'https://campuscoin.test/ideas/second-hand',
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.idea.title, 'Temporary idea, renamed');
  assert.equal(edited.body.idea.sortOrder, 9);
  assert.equal(edited.body.idea.icon, '📦', 'an untouched field is left alone');

  // Required fields are still required when a patch leaves them out.
  const blank = await patchIdea(made.body.idea.id, { title: '   ' });
  assert.equal(blank.status, 400);
  assert.match(blank.body.error, /title/i);

  const gone = await withCsrf(admin, admin.agent.delete(`/api/control/side-income/${made.body.idea.id}`));
  assert.equal(gone.status, 200);
  assert.equal(gone.body.ok, true);

  const list = await newAgent().get('/api/side-income?q=Temporary%20idea');
  assert.equal(list.body.pagination.total, 0);

  const missing = await withCsrf(admin, admin.agent.delete('/api/control/side-income/64b000000000000000000000'));
  assert.equal(missing.status, 404);

  const ghost = await newAgent().get('/api/side-income/64b000000000000000000000');
  assert.equal(ghost.status, 404);
  assert.match(ghost.body.error, /not found/i);
});

test('the admin list also carries the retired rows, so one can be brought back', async () => {
  const made = await addIdea({
    title: 'Retired idea',
    category: 'services',
    summary: 'Switched off for a moment, then switched on again.',
  });

  const off = await patchIdea(made.body.idea.id, { isActive: false });
  assert.equal(off.body.idea.isActive, false);

  const publicList = await newAgent().get('/api/side-income?q=Retired%20idea');
  assert.equal(publicList.body.pagination.total, 0, 'students never see a retired row');

  const adminList = await withCsrf(admin, admin.agent.get('/api/control/side-income?q=Retired%20idea'));
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.pagination.total, 1);
  assert.equal(adminList.body.rows[0].isActive, false);

  const on = await patchIdea(made.body.idea.id, { isActive: true });
  assert.equal(on.body.idea.isActive, true);
});

/* --------------------------------- harness -------------------------------- */

/**
 * The administrator: a real account signed in through the control door, so
 * every write below goes through the same guard the panel uses.
 */
async function signInAdmin() {
  const { default: User } = await import('../src/models/User.js');
  const bcrypt = (await import('bcryptjs')).default;
  await User.create({
    name: 'Coordinator',
    email: 'side-income-admin@test.local',
    recoveryEmail: 'side-income-admin.recovery@test.local',
    passwordHash: await bcrypt.hash('Str0ngPass!', 4),
    role: 'admin',
  });

  const agent = newAgent();
  const signedIn = await agent
    .post('/api/auth/control-login')
    .send({ email: 'side-income-admin@test.local', password: 'Str0ngPass!' });
  assert.equal(signedIn.status, 200, 'the administrator signs in through the control door');

  const me = await agent.get('/api/auth/me');
  return { agent, csrf: me.body.csrfToken };
}

function addIdea(payload) {
  return withCsrf(admin, admin.agent.post('/api/control/side-income')).send(payload);
}

function patchIdea(id, payload) {
  return withCsrf(admin, admin.agent.patch(`/api/control/side-income/${id}`)).send(payload);
}
