import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { parseQuickText, logQuickText } from '../services/quickText.js';

/**
 * Quick-text logger endpoints (QS-1).
 *
 * POST /api/quick-text      → { text }            save the sentence as an entry
 * POST /api/quick-text/preview → { text }         parse only, nothing written
 *
 * Mount: app.use('/api/quick-text', quickTextRoutes)  — see routes/suggest.js for
 * the same shape. The views stay thin: both calls go straight to the service.
 */

const router = Router();
router.use(requireStudent);

/** Parse without writing — the dashboard uses this while the student types. */
router.post('/preview', async (req, res, next) => {
  try {
    res.json({ draft: parseQuickText(req.body?.text) });
  } catch (err) {
    next(err);
  }
});

/** Parse and save. The draft comes back with the entry so the UI can confirm. */
router.post('/', async (req, res, next) => {
  try {
    const result = await logQuickText(req.user, req.body?.text);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
