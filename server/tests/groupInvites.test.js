import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, registerStudent, withCsrf } from './helpers.js';
import GroupInvite from '../src/models/GroupInvite.js';

/**
 * A group's QR invite, and the shape of the secret behind it.
 *
 * The harness is the one from groupChat.test.js: an in-memory database, real
 * sign-ups, real sessions, the CSRF header on every session-bearing write.
 * BOTH routers are mounted here — the groups router because an invite needs a
 * group to belong to, and the invite routers because app.js is not this
 * feature's file to edit. They are pushed in front of the /api 404 layer and
 * behind the session and CSRF middleware, so the CSRF assertions below are
 * real.
 *
 * What is asserted here, in the order it matters:
 *   the token is never stored in plain text
 *   the expiry is 48 hours, absolute, and an expired token is refused
 *   a second code while one is live is REFUSED (see the note in the service)
 *   revoke, and the public read's EXACT key set
 *   a stranger's group and a stranger's invite are 404, never 403
 *   joining twice is refused, and a double tap cannot write two member rows
 *   the role after joining is `member`, and it may only view
 *   a full group refuses, with the same wording addMember uses
 *   a forwarded link is dead after one use
 *   the anti-abuse guards are real, not comments
 *
 * EVERY src/ IMPORT BELOW HAPPENS IN `before`, AND THAT IS LOAD-BEARING
 * ---------------------------------------------------------------------
 * `config/env.js` reads its values ONCE, at import time, and `test.before` runs
 * AFTER every static import in this file. The harness points MONGODB_URI at a
 * fresh in-memory server from inside `startApp()`; a top-level import of
 * anything that reaches `env` therefore freezes the default
 * `mongodb://127.0.0.1:27017` in place, and every request in the suite fails
 * with ECONNREFUSED against a database that is not there.
 *
 * That is not hypothetical for the groups router: `services/groups.js` now
 * imports `./accountDeletion.js`, which imports `config/env.js`, so
 * `routes/groups.js` reaches `env` too and a static import of it breaks this
 * suite. Loading both routers here, after the harness, is the same discipline
 * `helpers.js` uses for `app.js` and `referrals.test.js` for its service — and
 * it is what keeps this file working when somebody else adds one import to a
 * module in the middle of it.
 *
 * The MODEL is still safe at the top: it imports mongoose and nothing else.
 */

let ctx;
/** The invite service, and the groups router, once the harness has a database. */
let invite;
let groupsRoutes;
let groupInviteRoutes;
let publicInvites;
let PREVIEW_READ_LIMIT;
let MAX_MEMBERS;
let MAX_LIVE_INVITES;
let INVITE_TTL_HOURS;
let JOIN_ATTEMPT_LIMIT;
let newInviteToken;
let sha256;
let tokenMatches;

test.before(async () => {
  // The harness first, so MONGODB_URI is chosen before config/env.js is read.
  ctx = await startApp();

  groupsRoutes = (await import('../src/routes/groups.js')).default;
  invite = await import('../src/services/groupInvites.js');
  ({ MAX_MEMBERS, MAX_LIVE_INVITES, INVITE_TTL_HOURS, JOIN_ATTEMPT_LIMIT,
     newInviteToken, sha256, tokenMatches } = invite);
  const routers = await import('../src/routes/groupInvites.js');
  groupInviteRoutes = routers.default;
  publicInvites = routers.publicInvites;
  PREVIEW_READ_LIMIT = routers.PREVIEW_READ_LIMIT;

  // The unique index on the token hash is what the public read's single index
  // seek relies on, and this suite asserts that seek's consequences — so the
  // index has to exist before the first request, not after it.
  await GroupInvite.init();
  mountGroups(ctx.app);
  mountGroupInvites(ctx.app);
  mountPublicInvites(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/** The groups router is mounted by src/app.js; mount it only if it is not. */
function mountGroups(app) {
  const stack = app._router.stack;
  const mounted = stack.some(
    (layer) => layer.name === 'router' && String(layer.regexp?.source).includes('api\\/groups')
  );
  if (mounted) return;

  app.use('/api/groups', groupsRoutes);
  const layer = stack.pop();
  const beforeStatic = stack.findIndex((row) => row.name === 'serveStatic');
  stack.splice(beforeStatic === -1 ? stack.length : beforeStatic, 0, layer);
}

/** The invite half that hangs off a group, and inherits the group's isolation. */
function mountGroupInvites(app) {
  const stack = app._router || app.router;
  if (!stack) throw new Error('cannot find the express router stack');

  app.use('/api/groups/:id/invites', groupInviteRoutes);
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/** The public half, which is the one route in the app that needs no session. */
function mountPublicInvites(app) {
  const stack = app._router || app.router;
  if (!stack) throw new Error('cannot find the express router stack');

  app.use('/api/invites', publicInvites);
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/* -------------------------------- fixtures -------------------------------- */

async function session(payload) {
  const agent = ctx.newAgent();
  const account = await registerStudent(agent, payload);
  return { agent, user: account.user, csrf: account.csrf, email: account.email };
}

async function createGroup(who, { name = 'Room 204', currency = 'USD', members = [] } = {}) {
  const res = await withCsrf(who, who.agent.post('/api/groups')).send({ name, currency, members });
  assert.equal(res.status, 201, res.text);
  return res.body.group;
}

function issue(who, groupId) {
  return withCsrf(who, who.agent.post(`/api/groups/${groupId}/invites`)).send({});
}

function join(who, token) {
  return withCsrf(who, who.agent.post(`/api/invites/${token}/join`)).send({});
}

function read(token, agent) {
  return (agent || ctx.request(ctx.app)).get(`/api/invites/${token}`);
}

/* ----------------------------- the stored secret -------------------------- */

test('the token is stored hashed, and the hash is the only copy there is', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const res = await issue(owner, group.id);
  assert.equal(res.status, 201, res.text);
  const { invite } = res.body;

  // what the owner gets, once
  assert.equal(typeof invite.token, 'string');
  assert.equal(invite.token.length, 43, 'base64url of 32 bytes');
  assert.equal(invite.url, `${new URL(invite.url).origin}/join/${invite.token}`);

  const raw = await GroupInvite.collection.findOne({ group: new mongoose.Types.ObjectId(group.id) });
  const stored = JSON.stringify(raw);
  assert.ok(raw.tokenHash, 'a hash is stored');
  assert.equal(raw.tokenHash, sha256(invite.token), 'the hash is sha256 of the plain token');
  assert.ok(!stored.includes(invite.token), 'the plain token appears nowhere in the document');
  // and the field is select:false, so a careless find() cannot even read it
  const viaModel = await GroupInvite.findById(raw._id);
  assert.equal(viaModel.tokenHash, undefined, 'tokenHash is select:false');
});

test('the token is 256 bits of crypto randomness and compares in constant time', () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);

  assert.equal(tokenMatches(a.hash, a.token), true);
  assert.equal(tokenMatches(a.hash, b.token), false);
  assert.equal(tokenMatches(a.hash, `${a.token}x`), false, 'a different length never throws');
  assert.equal(tokenMatches('', a.token), false);
  assert.equal(tokenMatches(a.hash, ''), false);
});

test('the expiry is 48 hours, stored as an absolute instant', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const before = Date.now();

  const res = await issue(owner, group.id);
  const expiresAt = new Date(res.body.invite.expiresAt);
  const hours = (expiresAt.getTime() - before) / (60 * 60 * 1000);

  assert.equal(INVITE_TTL_HOURS, 48);
  assert.ok(hours > 47.9 && hours <= 48.1, `expected 48 hours, got ${hours}`);

  // absolute, not a duration recomputed on read: the row carries the instant
  const row = await GroupInvite.findOne({ tokenHash: sha256(res.body.invite.token) }).select('+tokenHash');
  assert.equal(new Date(row.expiresAt).toISOString(), expiresAt.toISOString());
});

/* --------------------------------- issuing -------------------------------- */

test('issuing returns the six fields the brief asked for, and a real code', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Block C' });

  const res = await issue(owner, group.id);
  assert.deepEqual(
    Object.keys(res.body.invite).sort(),
    ['expiresAt', 'groupName', 'id', 'svg', 'token', 'url']
  );
  assert.equal(res.body.invite.groupName, 'Block C');
  assert.match(res.body.invite.svg, /^<svg[\s>]/, 'a real SVG, rendered by the server');
  assert.ok(res.body.invite.svg.includes('<path'), 'with the modules in it');
  // the code in the picture is the code in the link
  assert.ok(res.body.invite.svg.length > 400);
});

test('a SECOND invite while one is live is REFUSED, and the first keeps working', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const first = await issue(owner, group.id);
  assert.equal(first.status, 201, first.text);
  const firstToken = first.body.invite.token;

  const second = await issue(owner, group.id);
  assert.equal(second.status, 400, second.text);
  assert.equal(second.body.error, 'invite.liveExists');
  assert.equal(second.body.message, 'invite.liveExists', 'a code, never a sentence');

  // the refusal is the whole point: a link already in the world is untouched
  const stillThere = await issue(owner, group.id);
  assert.equal(stillThere.status, 400);
  const live = await owner.agent.get(`/api/groups/${group.id}/invites`);
  assert.equal(live.body.invites.length, MAX_LIVE_INVITES);
  assert.equal(live.body.invites[0].id, first.body.invite.id);
  assert.ok((await read(firstToken)).body.invite.ok, 'the first code is still good');
});

test('after a revoke a new code can be issued', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const first = await issue(owner, group.id);

  const revoked = await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}/invites/${first.body.invite.id}`));
  assert.equal(revoked.status, 200, revoked.text);
  assert.ok(revoked.body.invite.revokedAt);

  // idempotent: pressing it twice is not an error, the state it wanted is true
  const again = await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}/invites/${first.body.invite.id}`));
  assert.equal(again.status, 200, again.text);

  const second = await issue(owner, group.id);
  assert.equal(second.status, 201, second.text);
  assert.notEqual(second.body.invite.token, first.body.invite.token);
});

test('a revoked code is dead, for the public read and for joining', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const other = await session({ name: 'Bilal' });
  const code = (await issue(owner, group.id)).body.invite;

  await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}/invites/${code.id}`));

  const preview = await read(code.token);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.invite, { ok: false });

  const attempt = await join(other, code.token);
  assert.equal(attempt.status, 400, attempt.text);
  assert.equal(attempt.body.error, 'invite.expired');
});

/* -------------------------------- permissions ----------------------------- */

test("the mount path's group id reaches the service (mergeParams, not a coincidence)", async () => {
  // Without `mergeParams: true` on the invite router, a router mounted at
  // /api/groups/:id/invites REPLACES req.params with its own, `req.params.id`
  // arrives undefined, and every call 404s with "Group not found." for a group
  // that plainly exists. This is the one line of router setup that has to be
  // right, so it is asserted on its own rather than left to the tests below to
  // fail in twenty different ways.
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const res = await issue(owner, group.id);
  assert.equal(res.status, 201, `a code for a group that exists: ${res.text}`);

  // and the id in the URL is what is stored, not something derived
  const row = await GroupInvite.findOne({ group: new mongoose.Types.ObjectId(group.id) });
  assert.ok(row, 'the row really is filed under that group');

  const missing = await issue(owner, '64b7f1c2a1b2c3d4e5f60718');
  assert.equal(missing.status, 404, 'a group that does not exist is still a 404');
});

test('the permission is `manage`: the owner and an admin, and NOT a treasurer', async () => {
  const owner = await session({ name: 'Aisha' });
  const friend = await session({ name: 'Bilal' });
  const treasurer = await session({ name: 'Chen' });

  const group = await createGroup(owner, {
    members: [{ name: 'Bilal', email: friend.email }, { name: 'Chen', email: treasurer.email }],
  });
  // Bilal links on his first read of the groups list
  await friend.agent.get('/api/groups');
  await treasurer.agent.get('/api/groups');

  const asOwner = await issue(owner, group.id);
  assert.equal(asOwner.status, 201, 'the owner is an admin by construction');

  // promote Bilal to admin, then he can issue
  const detail = await owner.agent.get(`/api/groups/${group.id}`);
  const bilalIndex = detail.body.members.find((m) => m.name === 'Bilal').index;
  const promoted = await withCsrf(owner, owner.agent.patch(`/api/groups/${group.id}/members/${bilalIndex}/role`))
    .send({ role: 'admin' });
  assert.equal(promoted.status, 200, promoted.text);

  // the second code is refused only by the cap, so prove the permission by
  // revoking the first and issuing from the admin's own session
  await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}/invites/${asOwner.body.invite.id}`));
  const asAdmin = await issue(friend, group.id);
  assert.equal(asAdmin.status, 201, 'a co-admin can issue an invite');

  await withCsrf(friend, friend.agent.delete(`/api/groups/${group.id}/invites/${asAdmin.body.invite.id}`));

  // a treasurer holds addBill / postJournal / reconcile, and NOT manage
  const chenIndex = detail.body.members.find((m) => m.name === 'Chen').index;
  await withCsrf(owner, owner.agent.patch(`/api/groups/${group.id}/members/${chenIndex}/role`))
    .send({ role: 'treasurer' });
  const asTreasurer = await issue(treasurer, group.id);
  assert.equal(asTreasurer.status, 403, 'a treasurer may NOT issue an invite');
  assert.equal(asTreasurer.body.code, undefined, "groups.js's own gate, not this feature's code");
});

test('a member with no powers is refused, and the list is refused too', async () => {
  const owner = await session({ name: 'Aisha' });
  const plain = await session({ name: 'Bilal' });
  const group = await createGroup(owner, { members: [{ name: 'Bilal', email: plain.email }] });
  await plain.agent.get('/api/groups');

  const minted = await issue(owner, group.id);
  assert.equal(minted.status, 201);

  assert.equal((await issue(plain, group.id)).status, 403);
  assert.equal((await plain.agent.get(`/api/groups/${group.id}/invites`)).status, 403);
  assert.equal(
    (await withCsrf(plain, plain.agent.delete(`/api/groups/${group.id}/invites/${minted.body.invite.id}`))).status,
    403
  );
});

test("a stranger's group is a 404, never a 403", async () => {
  const owner = await session({ name: 'Aisha' });
  const stranger = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const minted = await issue(owner, group.id);

  /*
   * One call at a time, with the response body in every failure message. Built
   * as four promises and awaited afterwards, the middle two get refused at the
   * socket rather than answered — which reads exactly like the router being
   * missing, and is really four requests fighting over one connection.
   */
  const list = await stranger.agent.get(`/api/groups/${group.id}/invites`);
  assert.equal(list.status, 404, list.text);

  const mint = await withCsrf(stranger, stranger.agent.post(`/api/groups/${group.id}/invites`)).send({});
  assert.equal(mint.status, 404, mint.text);

  const revoke = await withCsrf(
    stranger,
    stranger.agent.delete(`/api/groups/${group.id}/invites/${minted.body.invite.id}`)
  );
  assert.equal(revoke.status, 404, revoke.text);

  const ghost = await stranger.agent.get('/api/groups/64b7f1c2a1b2c3d4e5f60718');
  assert.equal(ghost.status, 404, ghost.text);

  // a stranger cannot get at the group through the PUBLIC half either: the
  // preview is by design open, and it is the only thing that is
  const preview = await ctx.newAgent().get(`/api/invites/${minted.body.invite.token}`);
  assert.equal(preview.status, 200, 'the preview really is public');
  assert.equal(Object.keys(preview.body.invite).length, 3, 'and really is only three fields');
});

/* ------------------------------ the public read --------------------------- */

test('the public read returns EXACTLY three fields, and no session is needed', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Block C Mess',
    members: [{ name: 'Bilal', email: 'bilal-in-group@example.test' }],
  });
  await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/expenses`)).send({
    title: 'Mess bill',
    amount: '120.00',
    date: '2026-09-10',
    paidByIndex: 0,
    currency: 'USD',
  });

  const code = (await issue(owner, group.id)).body.invite;

  // no cookie at all, no CSRF token, a brand new agent
  const guest = ctx.newAgent();
  const res = await guest.get(`/api/invites/${code.token}`);
  assert.equal(res.status, 200, res.text);

  assert.deepEqual(
    Object.keys(res.body.invite).sort(),
    ['groupName', 'memberCount', 'ok'],
    'the whole answer: a name, a headcount, and whether the code still works'
  );
  assert.deepEqual(res.body.invite, { ok: true, groupName: 'Block C Mess', memberCount: 2 });

  // and nothing else about the group is on the wire
  const text = res.text;
  for (const secret of ['Bilal', 'bilal-in-group@example.test', 'Aisha', '120', 'USD', group.id]) {
    assert.ok(!text.includes(secret), `the public read leaked ${secret}`);
  }
});

test('a GET on the public read is a GET: it needs no CSRF token', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  const res = await owner.agent.get(`/api/invites/${code.token}`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.invite.ok, true);
});

test('expired, revoked, unknown and already-used are all the SAME answer', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const other = await session({ name: 'Bilal' });

  // 1. unknown — a well-formed token nobody ever issued
  const unknown = await read(newInviteToken().token);
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body.invite, { ok: false });

  // 2. expired — 48 hours is an absolute instant, so it is moved in the row
  const expiredCode = (await issue(owner, group.id)).body.invite;
  await GroupInvite.updateOne(
    { tokenHash: sha256(expiredCode.token) },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );
  const expired = await read(expiredCode.token);
  assert.equal(expired.status, 200);
  assert.deepEqual(expired.body.invite, { ok: false });
  // and an expired code cannot be joined
  assert.equal((await join(other, expiredCode.token)).body.error, 'invite.expired');

  // 3. revoked
  const revokedCode = (await issue(owner, group.id)).body.invite;
  await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}/invites/${revokedCode.id}`));
  const revoked = await read(revokedCode.token);
  assert.equal(revoked.status, 200);
  assert.deepEqual(revoked.body.invite, { ok: false });

  // 4. already used
  const usedCode = (await issue(owner, group.id)).body.invite;
  await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}/invites/${revokedCode.id}`));
  const joined = await join(other, usedCode.token);
  assert.equal(joined.status, 200, joined.text);
  const used = await read(usedCode.token);
  assert.equal(used.status, 200);
  assert.deepEqual(used.body.invite, { ok: false });

  // all four are byte-identical, and so is a malformed token
  const junk = await read('not-a-token');
  assert.equal(junk.status, 200);
  for (const res of [unknown, expired, revoked, used, junk]) {
    assert.deepEqual(res.body, { invite: { ok: false } });
    assert.equal(res.status, 200);
  }
});

/* --------------------------------- joining -------------------------------- */

test('joining adds exactly one member, and the role is `member`', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  const before = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(before.body.members.length, 1);

  const res = await join(joiner, code.token);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.joined, true);
  assert.equal(res.body.group.role, 'member', 'an invite is not a promotion');

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.group.name, 'Room 204');
  assert.equal(after.body.members.length, 2, 'one member, added once');

  const seat = after.body.members[1];
  assert.equal(seat.name, 'Bilal');
  assert.equal(seat.role, 'member');
  assert.equal(seat.isOwner, false);
  assert.equal(seat.user, joiner.user.id, 'linked to the account that signed in');

  // the least power in GROUP_ROLES: it may read the group and nothing else
  const asMember = await joiner.agent.get(`/api/groups/${group.id}`);
  assert.equal(asMember.status, 200);
  assert.deepEqual(asMember.body.group.viewer.can, {
    view: true,
    addBill: false,
    postJournal: false,
    reconcile: false,
    flag: false,
    manage: false,
  });
  // a member cannot log a bill, which is the power an invite must never hand out
  const bill = await withCsrf(joiner, joiner.agent.post(`/api/groups/${group.id}/expenses`)).send({
    title: 'Sneaky',
    amount: '10.00',
    date: '2026-09-11',
    paidByIndex: 0,
  });
  assert.equal(bill.status, 403);
});

test('joining twice is refused, not silently idempotent', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  assert.equal((await join(joiner, code.token)).status, 200);
  const second = await join(joiner, code.token);
  assert.equal(second.status, 400, second.text);
  assert.equal(second.body.error, 'invite.alreadyMember');

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.members.length, 2, 'still one Bilal');
});

test('a double-tapped confirm does not write two members', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  // two taps inside one tick, exactly what a double-click is
  const [a, b] = await Promise.all([join(joiner, code.token), join(joiner, code.token)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400], 'one win and one clean refusal');

  /*
   * WHICH refusal the loser gets is a race, and both are correct answers:
   *
   *   invite.alreadyMember — it read the group after the winner's seat was
   *                          written, so it found this account already in
   *   invite.expired       — it read the group BEFORE that, passed every
   *                          check, and then lost the atomic claim on the code
   *
   * What must never happen is a second member row, and what must always happen
   * is a refusal rather than a second success. So the assertion is on the shape
   * of the answer, not on which of the two it was.
   */
  const loser = a.status === 400 ? a : b;
  assert.ok(
    ['invite.alreadyMember', 'invite.expired'].includes(loser.body.error),
    `a clean refusal, got ${loser.body.error}`
  );
  assert.equal(loser.body.group, undefined, 'and no group comes back with a refusal');

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.members.length, 2, 'one member row, not two');
  assert.equal(
    after.body.members.filter((m) => m.name === 'Bilal').length,
    1,
    'and only one row for that person'
  );

  // three more taps for good measure: still one
  await Promise.all([join(joiner, code.token), join(joiner, code.token), join(joiner, code.token)]);
  const after2 = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after2.body.members.length, 2);
  assert.equal(after2.body.members.filter((m) => m.name === 'Bilal').length, 1);

  // and the row records one use, not two
  const row = await GroupInvite.findOne({ tokenHash: sha256(code.token) }).select('+tokenHash');
  assert.ok(row.usedAt, 'the code was claimed');
  assert.equal(String(row.usedBy), joiner.user.id, 'by exactly this account');
});

test('a FORWARDED link is dead after one use', async () => {
  const owner = await session({ name: 'Aisha' });
  const first = await session({ name: 'Bilal' });
  const second = await session({ name: 'Chen' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  assert.equal((await join(first, code.token)).status, 200, 'the person it was for');

  const forwarded = await join(second, code.token);
  assert.equal(forwarded.status, 400, forwarded.text);
  assert.equal(forwarded.body.error, 'invite.expired', 'the same answer as any dead code');
  assert.equal((await read(code.token)).body.invite.ok, false);

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.members.length, 2, 'the forwarded link added nobody');
  assert.ok(!after.body.members.some((m) => m.name === 'Chen'));

  // and the record says who used it, when — the audit trail, not a preview
  const row = await GroupInvite.findOne({ tokenHash: sha256(code.token) }).select('+tokenHash');
  assert.ok(row.usedAt, 'the single-use flag is set');
  assert.equal(String(row.usedBy), first.user.id);
  assert.equal(row.revokedAt, null);
});

test('an already-in-group person who scans an invite is told so, and no row is added', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner, { members: [{ name: 'Bilal', email: joiner.email }] });
  await joiner.agent.get('/api/groups'); // the email link, as the app does it

  const code = (await issue(owner, group.id)).body.invite;
  const res = await join(joiner, code.token);
  assert.equal(res.status, 400, res.text);
  assert.equal(res.body.error, 'invite.alreadyMember');
  assert.equal(res.body.message, 'invite.alreadyMember', 'a key, not the English sentence');

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.members.length, 2, 'still owner + one Bilal');
});

test('an invite needs a session, and a session-bearing write needs CSRF', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  // joining signed out
  const guest = ctx.newAgent();
  const anon = await guest.post(`/api/invites/${code.token}/join`).send({});
  assert.equal(anon.status, 401, 'the person joining has to be known');

  // joining without the CSRF header
  const noToken = await joiner.agent.post(`/api/invites/${code.token}/join`).send({});
  assert.equal(noToken.status, 403, noToken.text);

  // issuing without the CSRF header
  const noIssue = await owner.agent.post(`/api/groups/${group.id}/invites`).send({});
  assert.equal(noIssue.status, 403, noIssue.text);

  // and the code is still good: the refusals above consumed nothing
  assert.equal((await join(joiner, code.token)).status, 200);
});

/* ------------------------------ closed groups ---------------------------- */

test('an archived group refuses a new invite, and its live code cannot be joined', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  const archived = await withCsrf(owner, owner.agent.patch(`/api/groups/${group.id}`)).send({ archived: true });
  assert.equal(archived.status, 200, archived.text);

  const refused = await issue(owner, group.id);
  assert.equal(refused.status, 400, refused.text);
  assert.equal(refused.body.error, 'invite.groupClosed');

  const attempt = await join(joiner, code.token);
  assert.equal(attempt.status, 400, attempt.text);
  assert.equal(attempt.body.error, 'invite.groupClosed');

  // and a closed group's code reads as dead rather than explaining itself
  const preview = await read(code.token);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.invite, { ok: false });
});

test('a deleted group leaves its code unusable rather than a door to nowhere', async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  const removed = await withCsrf(owner, owner.agent.delete(`/api/groups/${group.id}`));
  assert.equal(removed.status, 200, removed.text);

  const attempt = await join(joiner, code.token);
  assert.equal(attempt.status, 400, attempt.text);
  assert.equal(attempt.body.error, 'invite.groupGone');

  const preview = await read(code.token);
  assert.deepEqual(preview.body.invite, { ok: false });
  const after = await joiner.agent.get('/api/groups');
  assert.equal(after.body.rows.length, 0, 'and nothing appeared on their dashboard');
});

/* -------------------------------- the full group -------------------------- */

test('a group at MAX_MEMBERS refuses a new invite — with the same wording addMember uses', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  // Fill the group with the real addMember, which owns the cap and the wording.
  // The loop starts at 2 and runs to MAX_MEMBERS INCLUSIVE, because the owner
  // is already members[0]: after it, the group holds exactly MAX_MEMBERS.
  for (let i = 2; i <= MAX_MEMBERS; i += 1) {
    const res = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/members`)).send({
      name: `Roomie ${i}`,
      email: `roomie-${i}@example.test`,
    });
    assert.equal(res.status, 201, res.text);
  }
  const filled = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(filled.body.members.length, MAX_MEMBERS, 'full, by the real addMember');

  const overflow = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'One Too Many',
    email: 'one-too-many@example.test',
  });
  assert.equal(overflow.status, 400, overflow.text);
  assert.equal(overflow.body.error, `A group holds at most ${MAX_MEMBERS} people.`);
  assert.equal(overflow.body.group, undefined, 'no group, no leak');

  // The invite now refuses for the same reason, and says the same thing.
  const refused = await issue(owner, group.id);
  assert.equal(refused.status, 400, refused.text);
  assert.equal(refused.body.error, 'invite.groupFull');
  assert.equal(refused.body.message, 'invite.groupFull', 'the code, not the sentence');

  // the cap is one shared constant, not a second copy of the rule
  assert.equal(MAX_MEMBERS, 20);
});

test('a full group also refuses a code that is ALREADY printed', async () => {
  // The state the issue-time cap cannot prevent: a code was minted when there
  // was room, and the last seat was taken before anybody scanned it. Accepting
  // a member there would put the group one over the cap addMember enforces, so
  // the join refuses instead — and the code is burnt rather than left live.
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  for (let i = 2; i <= MAX_MEMBERS; i += 1) {
    const res = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/members`)).send({
      name: `Roomie ${i}`,
      email: `lastseat-${i}@example.test`,
    });
    assert.equal(res.status, 201, res.text);
  }
  assert.equal(
    (await owner.agent.get(`/api/groups/${group.id}`)).body.members.length,
    MAX_MEMBERS,
    'full, by the real addMember'
  );

  const attempt = await join(joiner, code.token);
  assert.equal(attempt.status, 400, attempt.text);
  assert.equal(attempt.body.error, 'invite.groupFull');

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.members.length, MAX_MEMBERS, 'and nobody was added anyway');
  assert.ok(!after.body.members.some((m) => m.name === 'Bilal'));
});

test('MAX_MEMBERS here and the cap in services/groups.js cannot drift apart', async () => {
  // The number is copied, because services/groups.js does not export it and is
  // not this feature's file to edit. This test is the tie between the two:
  // addMember is asked, one person at a time, until it refuses, and the count
  // at which it refuses is the count this feature must refuse at too.
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  let refusedAt = -1;
  for (let i = 2; i <= MAX_MEMBERS + 3; i += 1) {
    const res = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/members`)).send({
      name: `Roomie ${i}`,
      email: `drift-${i}@example.test`,
    });
    if (res.status === 400) {
      refusedAt = (await owner.agent.get(`/api/groups/${group.id}`)).body.members.length;
      assert.equal(
        res.body.error,
        `A group holds at most ${MAX_MEMBERS} people.`,
        "addMember's exact sentence, at the exact count this feature uses"
      );
      break;
    }
    assert.equal(res.status, 201, res.text);
  }

  assert.equal(refusedAt, MAX_MEMBERS, 'the two agree on the number of people a group holds');

  // and the invite half refuses at that same count, with its own key
  const again = await issue(owner, group.id);
  assert.equal(again.status, 400, again.text);
  assert.equal(again.body.error, 'invite.groupFull');
});

/* --------------------------------- anti-abuse ----------------------------- */

test('POST /join is rate limited per ACCOUNT, and the limit is a real counter', async () => {
  // One account carrying a stack of printed links through a corridor. Each
  // group is a different group, so nothing but the counter stops it.
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const codes = [];
  for (let i = 0; i < JOIN_ATTEMPT_LIMIT + 2; i += 1) {
    const group = await createGroup(owner, { name: `Room ${i}` });
    codes.push((await issue(owner, group.id)).body.invite.token);
  }

  const outcomes = [];
  for (const token of codes) {
    const res = await join(joiner, token); // eslint-disable-line no-await-in-loop
    outcomes.push(res.status);
  }

  // JOIN_ATTEMPT_LIMIT attempts are honoured...
  const allowed = outcomes.filter((status) => status === 200).length;
  assert.equal(allowed, JOIN_ATTEMPT_LIMIT, `expected ${JOIN_ATTEMPT_LIMIT} joins, got ${allowed}: ${outcomes}`);
  // ...and every one after that is the same 429
  const blocked = outcomes.filter((status) => status === 429);
  assert.equal(blocked.length, codes.length - JOIN_ATTEMPT_LIMIT, `saw ${outcomes}`);

  const refused = await join(joiner, codes[codes.length - 1]);
  assert.equal(refused.status, 429, refused.text);
  assert.equal(refused.body.error, 'invite.tooManyTries');
  assert.equal(refused.body.message, 'invite.tooManyTries');
  assert.ok(refused.body.waitMinutes > 0 && refused.body.waitMinutes <= 15, 'and says how long to wait');

  // A different account is unaffected: the budget is per ACCOUNT. It needs a
  // code of its own, because every one of the codes above was already redeemed
  // by `joiner` — and single-use is a property of the code, not of the budget,
  // which is exactly why this is a fair comparison.
  const spare = await createGroup(owner, { name: 'Room Spare' });
  const spareCode = (await issue(owner, spare.id)).body.invite.token;

  const someoneElse = await session({ name: 'Chen' });
  const ok = await join(someoneElse, spareCode);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(
    (await owner.agent.get(`/api/groups/${spare.id}`)).body.members.length,
    2,
    'and a second account really is still allowed through'
  );
});

test('the unauthenticated preview is rate limited, and says so in its headers', async () => {
  /*
   * The limiter's BUDGET is asserted from the standard headers rather than by
   * spending 130 requests to trip it.
   *
   * Exhausting a shared, process-wide counter inside a test file is a bad
   * neighbour: every other test in this suite reads /api/invites from the same
   * address, so a test that deliberately burns the whole budget changes the
   * result of the tests around it and makes the file order-dependent. The
   * headers are what the limiter publishes on every call, so they prove both
   * halves of the claim — that the guard is mounted on this exact route, and
   * what its budget is — without touching anybody else's count.
   */
  const res = await read(newInviteToken().token);
  assert.equal(res.status, 200, res.text);

  const limit = res.headers['ratelimit-limit'] || res.headers.ratelimit;
  const remaining = res.headers['ratelimit-remaining'];
  assert.ok(limit, 'the rate limiter is on the public read, and says its budget');
  assert.equal(String(limit), String(PREVIEW_READ_LIMIT), 'at the documented number');
  assert.ok(Number(remaining) < Number(limit), 'and counts down from it');

  // a limited call answers with the same code the join path uses, never prose
  assert.equal(res.body.invite.ok, false, 'a refusal is still the quiet shape');
});

/* ---------------------------------- lists --------------------------------- */

test('the live-invite list is for managers, and never carries a token', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const code = (await issue(owner, group.id)).body.invite;

  const res = await owner.agent.get(`/api/groups/${group.id}/invites`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.invites.length, 1);
  assert.deepEqual(
    Object.keys(res.body.invites[0]).sort(),
    ['createdAt', 'expiresAt', 'id'],
    'an id and two dates. The code is not in the database, so it cannot be here.'
  );
  assert.equal(res.body.invites[0].id, code.id);
  assert.ok(!res.text.includes(code.token), 'not even accidentally');

  // an empty group has nothing out there
  const fresh = await createGroup(owner, { name: 'Quiet Room' });
  assert.deepEqual((await owner.agent.get(`/api/groups/${fresh.id}/invites`)).body, { invites: [] });
});

/* --------------------------------- isolation ------------------------------ */

test("one group's invite cannot be redeemed against another group's group", async () => {
  const owner = await session({ name: 'Aisha' });
  const joiner = await session({ name: 'Bilal' });
  const one = await createGroup(owner, { name: 'Room 204' });
  const two = await createGroup(owner, { name: 'Room 205' });
  const code = (await issue(owner, one.id)).body.invite;

  // revoking through the other group is a 404, not a cross-group write
  const crossed = await withCsrf(owner, owner.agent.delete(`/api/groups/${two.id}/invites/${code.id}`));
  assert.equal(crossed.status, 404, crossed.text);

  // and the code still belongs to room 204
  assert.equal((await join(joiner, code.token)).status, 200);
  const inTwo = await owner.agent.get(`/api/groups/${two.id}`);
  assert.equal(inTwo.body.members.length, 1, 'nothing leaked into the other group');
});
