import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { personalNudge } from '../services/growMoney.js';

/**
 * Grow-your-money (HTTP layer only — every decision lives in
 * services/growMoney.js). Mounted at /api/grow-money.
 *
 * The page is inside the signed-in app, so the student guard sits on the whole
 * router: the one number in here is the reader's own monthly surplus, and it
 * must never be fetched for someone else.
 */
const router = Router();
router.use(requireStudent);

/**
 * GET / — this month's surplus and the key of the sentence that describes it.
 *
 * A read with no side effects: the page can be opened and re-opened as often
 * as the student likes, and there is nothing to write down afterwards, because
 * the number is recomputed from the ledger every time (the same rule survival
 * mode follows — see services/survival.js).
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await personalNudge(req.user));
  } catch (err) {
    next(err);
  }
});

export default router;
