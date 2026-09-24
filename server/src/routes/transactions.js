import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';
import TransactionHistory from '../models/TransactionHistory.js';
import RecentActivity from '../models/RecentActivity.js';
import Category from '../models/Category.js';
import {
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
  restoreTransaction,
  listTransactions,
  ownTransaction,
} from '../services/ledger.js';
import { clearFlag } from '../services/anomaly.js';
import { toNum } from '../utils/money.js';

const router = Router();
router.use(requireStudent);

/* --------------------------------- list (TXN-5) -------------------------------- */

router.get('/', async (req, res, next) => {
  try {
    const result = await listTransactions(req.user, req.query);
    res.json({
      rows: result.rows.map(present),
      pagination: {
        page: result.page,
        perPage: result.perPage,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / result.perPage)),
      },
      totals: { income: toNum(result.income), expense: toNum(result.expense) },
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- create (TXN-1) -------------------------------- */

router.post('/', async (req, res, next) => {
  try {
    const txn = await createTransaction(req.user, req.body);
    res.status(201).json({ transaction: present(txn) });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------- detail ------------------------------------- */

router.get('/:id', async (req, res, next) => {
  try {
    const txn = await ownTransaction(req.user, req.params.id);
    await txn.populate('category', 'name type icon');
    await remember(req, txn._id, 'viewed');
    res.json({ transaction: present(txn) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ edit (TXN-4) ----------------------------------- */

router.patch('/:id', async (req, res, next) => {
  try {
    const txn = await updateTransaction(req.user, req.params.id, req.body);
    res.json({ transaction: present(txn) });
  } catch (err) {
    next(err);
  }
});

/* ------------------- soft delete + restore (TXN-4/TXN-7) ----------------------- */

router.delete('/:id', async (req, res, next) => {
  try {
    const txn = await softDeleteTransaction(req.user, req.params.id);
    res.json({ transaction: present(txn), restorable: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const txn = await restoreTransaction(req.user, req.params.id);
    res.json({ transaction: present(txn) });
  } catch (err) {
    next(err);
  }
});

/** The bin: soft-deleted rows, newest first, each restorable. */
router.get('/deleted/list', async (req, res, next) => {
  try {
    const rows = await Transaction.find({ user: req.user._id, isDeleted: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate('category', 'name type icon');
    res.json({ rows: rows.map(present) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- audit trail (TXN-4) ------------------------------- */

router.get('/:id/history', async (req, res, next) => {
  try {
    // 404 first: the id must belong to this person before we read its trail.
    await ownTransaction(req.user, req.params.id, { includeDeleted: true });
    const rows = await TransactionHistory.find({
      user: req.user._id,
      transaction: req.params.id,
    }).sort({ changedAt: -1 });

    res.json({
      rows: rows.map((r) => ({
        id: r._id.toString(),
        action: r.action,
        before: r.before,
        after: r.after,
        changedAt: r.changedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------ anomaly badge dismissal (SYS-3) ---------------------- */

router.post('/:id/not-duplicate', async (req, res, next) => {
  try {
    const txn = await clearFlag(req.user, req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ transaction: present(txn) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ recent activity (SYS-1) ------------------------ */

router.get('/meta/recent', async (req, res, next) => {
  try {
    const rows = await RecentActivity.find({ user: req.user._id })
      .sort({ at: -1 })
      .limit(10)
      .populate({ path: 'transaction', select: 'description amount type date category', populate: { path: 'category', select: 'name icon' } });

    res.json({
      rows: rows
        .filter((r) => r.transaction && !r.transaction.isDeleted)
        .map((r) => ({
          id: r.transaction._id.toString(),
          action: r.action,
          at: r.at,
          description: r.transaction.description,
          amount: toNum(r.transaction.amount),
          type: r.transaction.type,
          date: r.transaction.date,
          category: r.transaction.category
            ? { id: r.transaction.category._id.toString(), name: r.transaction.category.name }
            : null,
        })),
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- helpers ------------------------------------ */

async function remember(req, txnId, action) {
  try {
    await RecentActivity.deleteMany({ user: req.user._id, transaction: txnId });
    await RecentActivity.create({ user: req.user._id, transaction: txnId, action, at: new Date() });
    const mine = await RecentActivity.find({ user: req.user._id }).sort({ at: -1 }).select('_id');
    if (mine.length > 20) {
      await RecentActivity.deleteMany({ _id: { $in: mine.slice(20).map((r) => r._id) } });
    }
  } catch {
    // Recent activity is a convenience — never fail the main request for it.
  }
}

export function present(txn) {
  const cat = txn.category;
  return {
    id: txn._id.toString(),
    amount: toNum(txn.amount),
    type: txn.type,
    description: txn.description,
    date: txn.date,
    flag: txn.flag,
    isDeleted: txn.isDeleted,
    suggestedCategory: txn.suggestedCategory || null,
    suggestionSource: txn.suggestionSource || null,
    recurringRule: txn.recurringRule || null,
    category:
      cat && typeof cat === 'object' && cat.name !== undefined
        ? { id: cat._id.toString(), name: cat.name, type: cat.type, icon: cat.icon }
        : cat,
    createdAt: txn.createdAt,
    updatedAt: txn.updatedAt,
  };
}

export default router;
