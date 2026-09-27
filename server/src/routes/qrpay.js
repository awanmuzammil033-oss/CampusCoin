/**
 * The scanned-payment routes (ADV-6), on their own path so they cannot collide
 * with anything that already answers to /api.
 *
 * Two calls, and the split between them is the whole design: `read` prices a code
 * without paying anything, so the camera can show the merchant and the converted
 * amount first, and `pay` is the one that writes. A person who scans a code and
 * changes their mind has already been told exactly what it would cost.
 */
import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { readPaymentCode, recordScannedPayment } from '../services/qrpay.js';

const router = Router();
router.use(requireStudent);

/**
 * Read a code and price it, without paying anything. The camera path calls this
 * the moment a frame decodes, so the person sees the merchant and the converted
 * amount BEFORE a single cent moves.
 */
router.post('/read', async (req, res, next) => {
  try {
    const data = await readPaymentCode(req.body?.code, {
      currency: req.body?.currency,
      user: req.user,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** Pay it: convert if it is not already in their own money, then record the expense. */
router.post('/pay', async (req, res, next) => {
  try {
    const data = await recordScannedPayment(req.user, {
      code: req.body?.code,
      currency: req.body?.currency,
      categoryId: req.body?.categoryId,
      date: req.body?.date,
    });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
