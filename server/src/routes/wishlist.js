import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { list, create, update, remove, deposit, withdraw, history, presentItem } from '../services/wishlist.js';
import { toNum } from '../utils/money.js';

/**
 * Secret wishlist & micro-savings jar (WISH-1 / WISH-2).
 *
 * Thin on purpose: every rule — ownership, the money maths, the "achieved"
 * decision — lives in services/wishlist.js, and the shared error handler turns
 * the readable sentence a service throws into the right 400 or 404.
 */
const router = Router();
router.use(requireStudent);

/** The page in one call: wishes with their progress, the jar and the summary. */
router.get('/', async (req, res, next) => {
  try {
    const data = await list(req.user);
    if (req.query.history) data.movements = await history(req.user, { limit: req.query.limit });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** Start a new wish. */
router.post('/', async (req, res, next) => {
  try {
    const wish = await create(req.user, req.body);
    res.status(201).json({ wish: presentItem(wish) });
  } catch (err) {
    next(err);
  }
});

/** The jar on its own — balance plus the last movements. */
router.get('/jar', async (req, res, next) => {
  try {
    const movements = await history(req.user, { limit: req.query.limit });
    res.json({ jarBalance: toNum(req.user.jarBalance) || 0, movements });
  } catch (err) {
    next(err);
  }
});

/** "I skipped that coffee" — money moves into the jar, optionally to a wish. */
router.post('/jar/deposit', async (req, res, next) => {
  try {
    const result = await deposit(req.user, req.body);
    res.status(201).json({ jarBalance: result.jarBalance, wish: result.wish ? presentItem(result.wish) : null });
  } catch (err) {
    next(err);
  }
});

/** Changed my mind — the same money comes back out of the jar. */
router.post('/jar/withdraw', async (req, res, next) => {
  try {
    const result = await withdraw(req.user, req.body);
    res.status(201).json({ jarBalance: result.jarBalance, wish: result.wish ? presentItem(result.wish) : null });
  } catch (err) {
    next(err);
  }
});

/** Edit a wish — the target can move, but never under what is already saved. */
router.patch('/:id', async (req, res, next) => {
  try {
    const wish = await update(req.user, req.params.id, req.body);
    res.json({ wish: presentItem(wish) });
  } catch (err) {
    next(err);
  }
});

/** Drop a wish. Anything saved for it stays in the jar. */
router.delete('/:id', async (req, res, next) => {
  try {
    await remove(req.user, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
