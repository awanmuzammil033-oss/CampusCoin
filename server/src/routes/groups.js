import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  listGroups,
  createGroup,
  groupDetail,
  updateGroup,
  deleteGroup,
  addMember,
  addExpense,
  settleUp,
} from '../services/groups.js';

/**
 * Shared groups (GRP-1..3). Nothing happens in this file: the student's id
 * goes down, the answer comes back up. Every read and write is scoped to the
 * person by services/groups.js, so a group that is not theirs is a 404 rather
 * than an empty page.
 */
const router = Router();
router.use(requireStudent);

/** The groups this student is in, with member/bill counts and last activity. */
router.get('/', async (req, res, next) => {
  try {
    const rows = await listGroups(req.user, { includeArchived: req.query.archived === '1' });
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const group = await createGroup(req.user, req.body);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

/** One group in full: members, bills, settlements and the balance board. */
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await groupDetail(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const group = await updateGroup(req.user, req.params.id, req.body);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await deleteGroup(req.user, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Add a roommate (owner only) — a name and an email are enough. */
router.post('/:id/members', async (req, res, next) => {
  try {
    const group = await addMember(req.user, req.params.id, req.body);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

/** Add a shared bill; the server works the split out and returns the board. */
router.post('/:id/expenses', async (req, res, next) => {
  try {
    const result = await addExpense(req.user, req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** Settle up: record that one member handed money to another. */
router.post('/:id/settle', async (req, res, next) => {
  try {
    const result = await settleUp(req.user, req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
