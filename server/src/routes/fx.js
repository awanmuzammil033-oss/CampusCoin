import { Router } from 'express';
import { rateTable, convert } from '../services/fxRates.js';
import { FEATURED } from '../services/fxRates.js';

/**
 * The converter behind the navbar 💱 button (ADV-1).
 *
 * Both endpoints are public and both are answered from the server-side cache,
 * so the button costs nothing to show on every page of the site — including
 * the pages a visitor sees before signing in.
 */
const router = Router();

/** GET /api/fx/rates — the whole table, with where it came from. */
router.get('/rates', async (req, res, next) => {
  try {
    res.json(await rateTable());
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/fx/convert?amount=100&from=PKR&to=USD
 * A GET, not a POST: nothing changes here, it is arithmetic on a cached table.
 */
router.get('/convert', async (req, res, next) => {
  try {
    const table = await rateTable();
    const result = convert(req.query.amount, req.query.from, req.query.to, table.rates);
    if (!result) {
      return res.status(400).json({
        error: 'That pair is not in the rate table.',
        asOf: table.asOf,
        source: table.source,
        featured: FEATURED,
      });
    }
    res.json({ ...result, asOf: table.asOf, source: table.source });
  } catch (err) {
    next(err);
  }
});

export default router;
