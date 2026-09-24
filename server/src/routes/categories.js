import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';

const router = Router();

/**
 * Manage Own Categories (CAT-3..5). Defaults are visible but read-only;
 * personal ones can be added, renamed and removed. Deleting a category that
 * still has transactions forces a reassignment first, so no transaction is
 * ever left pointing at nothing.
 */

/* ------------------------------- list (CAT-1/2) ------------------------------ */

router.get('/', requireStudent, async (req, res, next) => {
  try {
    const all = await Category.forUser(req.user._id);
    res.json({
      income: all.filter((c) => c.type === 'income').map(present),
      expense: all.filter((c) => c.type === 'expense').map(present),
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- create ----------------------------------- */

router.post('/', requireStudent, async (req, res, next) => {
  try {
    const problem = await validateInput(req);
    if (problem) return res.status(400).json({ error: problem });

    const category = await Category.create({
      user: req.user._id,
      name: req.body.name.trim(),
      nameKey: req.body.name.trim().toLowerCase(),
      type: req.body.type,
      icon: String(req.body.icon || '').trim().slice(0, 30),
      isDefault: false,
    });
    res.status(201).json({ category: present(category) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You already have a category with that name.' });
    }
    next(err);
  }
});

/* ---------------------------------- edit ------------------------------------ */

router.patch('/:id', requireStudent, async (req, res, next) => {
  try {
    const category = await ownCategory(req, res);
    if (!category) return;
    if (category.isDefault) {
      return res.status(403).json({ error: 'Default categories cannot be changed. Make your own instead.' });
    }

    const problem = await validateInput(req, category._id);
    if (problem) return res.status(400).json({ error: problem });

    // A category's type is tied to every transaction filed under it —
    // flipping income→expense would silently rewrite their meaning.
    if (req.body.type && req.body.type !== category.type) {
      const used = await Transaction.exists({ user: req.user._id, category: category._id, isDeleted: false });
      if (used) {
        return res.status(409).json({
          error: 'This category already has entries. Type cannot change — create a new category instead.',
        });
      }
    }

    category.name = req.body.name.trim();
    category.nameKey = category.name.toLowerCase();
    category.type = req.body.type;
    if (req.body.icon !== undefined) category.icon = String(req.body.icon).trim().slice(0, 30);
    await category.save();

    res.json({ category: present(category) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You already have a category with that name.' });
    }
    next(err);
  }
});

/* ------------------------ delete with reassign (CAT-4) ----------------------- */

router.delete('/:id', requireStudent, async (req, res, next) => {
  try {
    const category = await ownCategory(req, res);
    if (!category) return;
    if (category.isDefault) {
      return res.status(403).json({ error: 'Default categories cannot be removed.' });
    }

    const inUse = await Transaction.countDocuments({
      user: req.user._id,
      category: category._id,
      isDeleted: false,
    });

    if (inUse > 0 && !req.body.reassignTo) {
      // Don't guess: ask where the existing entries should live instead.
      return res.status(409).json({
        error: 'in_use',
        message: `This category has ${inUse} entr${inUse === 1 ? 'y' : 'ies'}. Choose another category to move them to.`,
      });
    }

    if (inUse > 0) {
      const target = await Category.findOne({
        _id: req.body.reassignTo,
        $or: [{ user: req.user._id }, { user: null, isDefault: true }],
        type: category.type,
        isActive: true,
      });
      if (!target) return res.status(400).json({ error: 'Choose a valid category to move the entries to.' });
      if (target._id.equals(category._id)) return res.status(400).json({ error: 'Pick a different category.' });

      await Transaction.updateMany(
        { user: req.user._id, category: category._id },
        { $set: { category: target._id } }
      );
      // Budgets follow the data, otherwise last month's limit vanishes.
      await Budget.updateMany({ user: req.user._id, category: category._id }, { $set: { category: target._id } });
    }

    category.isActive = false; // soft delete: history still reads correctly
    await category.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- helpers ---------------------------------- */

async function ownCategory(req, res) {
  const category = await Category.findOne({
    _id: req.params.id,
    $or: [{ user: req.user._id }, { user: null, isDefault: true }],
  });
  // Anything else — another person's row, a bad id — simply doesn't exist
  // from this caller's point of view (cross-user access => 404).
  if (!category) {
    res.status(404).json({ error: 'Category not found.' });
    return null;
  }
  return category;
}

/** Name present, ≤60 chars, valid type, unique per user per type (CAT-5). */
async function validateInput(req, ignoringId = null) {
  const name = String(req.body.name || '').trim();
  const type = String(req.body.type || '');

  if (!name) return 'Please enter a category name.';
  if (name.length > 60) return 'Category names can be at most 60 characters.';
  if (!['income', 'expense'].includes(type)) return 'Type must be income or expense.';

  const clash = await Category.findOne({
    user: req.user._id,
    type,
    nameKey: name.toLowerCase(),
    ...(ignoringId ? { _id: { $ne: ignoringId } } : {}),
  });
  if (clash) return 'You already have a category with that name.';
  return null;
}

function present(c) {
  return {
    id: c._id.toString(),
    name: c.name,
    type: c.type,
    isDefault: c.isDefault,
    icon: c.icon,
    isActive: c.isActive,
  };
}

export default router;
export { present as presentCategory };
