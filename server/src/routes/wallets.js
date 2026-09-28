import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  ensureWallets,
  listWallets,
  createWallet,
  updateWallet,
  archiveWallet,
  ownWallet,
  recordTransfer,
  transferHistory,
  walletBalances,
  defaultWallet,
  withBalance,
} from '../services/wallets.js';

/**
 * Wallets, and the movements between them (NEW-11).
 *
 * The shape of this module is the same as every other router here: it checks who
 * is asking, calls one service, and answers. Every rule - what a balance is, why a
 * transfer is not a transaction, what makes a name a duplicate - lives in
 * services/wallets.js, where it can be tested without a server.
 *
 * A stranger's wallet is a 404 and never a 403: this app does not confirm that an
 * id belongs to somebody else.
 */
const router = Router();
router.use(requireStudent);

/* --------------------------------- reading --------------------------------- */

/**
 * The wallets and their current balances.
 *
 * The self-healing sweep runs here, exactly as the groups list does: an account
 * that has never opened this screen still has wallets the first time it does, and
 * an account created before wallets existed gets them without anybody noticing.
 */
router.get('/', async (req, res, next) => {
  try {
    await ensureWallets(req.user);
    const includeArchived = req.query.archived === '1';
    res.json({
      wallets: await listWallets(req.user, { includeArchived }),
      defaultId: (await defaultWallet(req.user))?._id.toString() || null,
    });
  } catch (err) {
    next(err);
  }
});

/** The dashboard's wallet row: balances plus this month's in and out per wallet. */
router.get('/balances', async (req, res, next) => {
  try {
    await ensureWallets(req.user);
    res.json(await walletBalances(req.user, { month: req.query.month || null }));
  } catch (err) {
    next(err);
  }
});

/** One wallet's own movements, newest first. */
router.get('/:id/history', async (req, res, next) => {
  try {
    await ownWallet(req.user, req.params.id);
    res.json({ rows: await transferHistory(req.user, { walletId: req.params.id, limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

/** Every movement, whichever end it was. */
router.get('/history/all', async (req, res, next) => {
  try {
    res.json({ rows: await transferHistory(req.user, { limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- writing --------------------------------- */

router.post('/', async (req, res, next) => {
  try {
    const wallet = await createWallet(req.user, req.body || {});
    res.status(201).json({ wallet: await withBalance(req.user, wallet) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const wallet = await updateWallet(req.user, req.params.id, req.body || {});
    res.json({ wallet: await withBalance(req.user, wallet) });
  } catch (err) {
    next(err);
  }
});

/** Archived, not deleted: the transactions that point at it still have to resolve. */
router.delete('/:id', async (req, res, next) => {
  try {
    const wallet = await archiveWallet(req.user, req.params.id);
    res.json({ wallet: await withBalance(req.user, wallet) });
  } catch (err) {
    next(err);
  }
});

/**
 * Move money between two of this person's own wallets.
 *
 * One document with both ends, never two transactions: the two sides happen at the
 * same instant, and two documents could disagree. Nothing here reaches an income
 * figure or an expense figure, which is the whole point - the balances move and
 * the reports do not.
 */
router.post('/transfer', async (req, res, next) => {
  try {
    const body = req.body || {};
    const transfer = await recordTransfer(req.user, {
      fromId: body.fromId,
      toId: body.toId,
      amount: body.amount,
      date: body.date,
      note: body.note,
    });
    res.status(201).json({ transfer, wallets: await listWallets(req.user) });
  } catch (err) {
    next(err);
  }
});

export default router;
