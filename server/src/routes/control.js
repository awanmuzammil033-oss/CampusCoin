import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAdmin } from '../middleware/auth.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import TipTemplate from '../models/TipTemplate.js';
import Announcement from '../models/Announcement.js';
import UserTip from '../models/UserTip.js';
import { newResetToken, sendMail } from '../services/accounts.js';
import env from '../config/env.js';
import { toNum } from '../utils/money.js';

/**
 * Admin control panel (ADM-1..5). Administrators run the catalogue and the
 * accounts — and deliberately never see anyone's transactions: this router
 * only ever counts them (ADM-5), the one aggregate query below groups by
 * category across all users and returns totals, never rows.
 *
 * Mount: app.use('/api/control', controlRoutes)
 */

const router = Router();
router.use(requireAdmin);

/* ------------------------------ usage stats (ADM-4) ---------------------------- */

router.get('/stats', async (req, res, next) => {
  try {
    const [activeUsers, totalStudents, totalTransactions, typeCounts, topRows] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student' }),
      Transaction.countDocuments({ isDeleted: false }),
      // Counts by type across everyone — figures, not records.
      Transaction.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$type', entries: { $sum: 1 } } },
      ]),
      // Most-used categories: grouped totals only, top five (ADM-5).
      Transaction.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$category',
            entries: { $sum: 1 },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { entries: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const names = await Category.find({ _id: { $in: topRows.map((r) => r._id) } }).select('name type icon');

    res.json({
      activeUsers,
      totalStudents,
      totalTransactions,
      entriesByType: {
        income: typeCounts.find((r) => r._id === 'income')?.entries || 0,
        expense: typeCounts.find((r) => r._id === 'expense')?.entries || 0,
      },
      topCategories: topRows
        .map((row) => {
          const category = names.find((c) => c._id.equals(row._id));
          if (!category) return null;
          return {
            id: category._id.toString(),
            name: category.name,
            type: category.type,
            icon: category.icon,
            entries: row.entries,
            total: toNum(row.total),
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- default categories (ADM-1) -------------------------- */

router.get('/categories', async (req, res, next) => {
  try {
    const rows = await Category.find({ user: null, isDefault: true }).sort({ type: 1, name: 1 });
    res.json({ rows: rows.map(presentCategory) });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const problem = await defaultCategoryProblem(req.body);
    if (problem) return res.status(400).json({ error: problem });

    const name = String(req.body.name).trim();
    const category = await Category.create({
      user: null,
      isDefault: true,
      name,
      nameKey: name.toLowerCase(),
      type: req.body.type,
      icon: cleanIcon(req.body.icon),
      isActive: true,
    });
    res.status(201).json({ category: presentCategory(category) });
  } catch (err) {
    next(err);
  }
});

router.patch('/categories/:id', async (req, res, next) => {
  try {
    const category = await defaultCategory(req, res);
    if (!category) return;

    if (req.body.type !== undefined && req.body.type !== category.type) {
      // Entries already filed under it were filed as its current type —
      // flipping that would quietly rewrite what they mean.
      return res.status(400).json({ error: 'The type of a default category cannot change.' });
    }

    const patch = {};
    if (req.body.name !== undefined) {
      const problem = await defaultCategoryProblem({ ...req.body, type: category.type }, category._id);
      if (problem) return res.status(400).json({ error: problem });
      patch.name = String(req.body.name).trim();
      patch.nameKey = patch.name.toLowerCase();
    }
    if (req.body.icon !== undefined) patch.icon = cleanIcon(req.body.icon);
    if (req.body.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

    Object.assign(category, patch);
    await category.save();
    res.json({ category: presentCategory(category) });
  } catch (err) {
    next(err);
  }
});

/** Soft removal: students stop seeing it in pickers, old entries keep their meaning. */
router.delete('/categories/:id', async (req, res, next) => {
  try {
    const category = await defaultCategory(req, res);
    if (!category) return;
    category.isActive = false;
    await category.save();
    res.json({ category: presentCategory(category) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- tip templates & notices (ADM-2) -------------------- */

router.get('/templates', async (req, res, next) => {
  try {
    const rows = await TipTemplate.find().sort({ kind: 1, code: 1 });
    res.json({ rows: rows.map(presentTemplate) });
  } catch (err) {
    next(err);
  }
});

router.post('/templates', async (req, res, next) => {
  try {
    const problem = await templateProblem(req.body);
    if (problem) return res.status(400).json({ error: problem });

    const template = await TipTemplate.create({
      code: String(req.body.code).trim().toLowerCase(),
      kind: req.body.kind || 'tip',
      title: String(req.body.title).trim(),
      bodyTemplate: String(req.body.bodyTemplate),
      isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
    });
    res.status(201).json({ template: presentTemplate(template) });
  } catch (err) {
    next(err);
  }
});

router.patch('/templates/:id', async (req, res, next) => {
  try {
    const template = await byId(TipTemplate, req.params.id, 'Template not found.', res);
    if (!template) return;

    // The engine looks templates up by code, so the code stays fixed once
    // created — everything else is freely rewordable. Validate with the
    // stored values filled in for whatever the admin left untouched.
    const problem = await templateProblem(
      {
        code: template.code,
        kind: req.body.kind ?? template.kind,
        title: req.body.title ?? template.title,
        bodyTemplate: req.body.bodyTemplate ?? template.bodyTemplate,
      },
      template._id
    );
    if (problem) return res.status(400).json({ error: problem });

    if (req.body.title !== undefined) template.title = String(req.body.title).trim();
    if (req.body.bodyTemplate !== undefined) template.bodyTemplate = String(req.body.bodyTemplate);
    if (req.body.kind !== undefined) template.kind = req.body.kind;
    if (req.body.isActive !== undefined) template.isActive = Boolean(req.body.isActive);
    await template.save();

    res.json({ template: presentTemplate(template) });
  } catch (err) {
    next(err);
  }
});

router.delete('/templates/:id', async (req, res, next) => {
  try {
    const template = await byId(TipTemplate, req.params.id, 'Template not found.', res);
    if (!template) return;

    // Tips already rendered from it keep pointing here, so a template in use
    // is retired rather than yanked out from under history.
    const inUse = await UserTip.exists({ template: template._id });
    if (inUse) {
      template.isActive = false;
      await template.save();
      return res.json({ template: presentTemplate(template), retired: true });
    }

    await template.deleteOne();
    res.json({ ok: true, retired: false });
  } catch (err) {
    next(err);
  }
});

router.get('/announcements', async (req, res, next) => {
  try {
    const rows = await Announcement.find().sort({ startsAt: -1 });
    res.json({ rows: rows.map(presentAnnouncement) });
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const dates = await announcementDates(req.body, res);
    if (!dates) return;

    const announcement = await Announcement.create({
      title: String(req.body.title).trim(),
      body: String(req.body.body).trim(),
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
      isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
      createdBy: req.user._id,
    });
    res.status(201).json({ announcement: presentAnnouncement(announcement) });
  } catch (err) {
    next(err);
  }
});

router.patch('/announcements/:id', async (req, res, next) => {
  try {
    const announcement = await byId(Announcement, req.params.id, 'Announcement not found.', res);
    if (!announcement) return;

    const dates = await announcementDates(req.body, res, announcement);
    if (!dates) return;

    if (req.body.title !== undefined) announcement.title = String(req.body.title).trim();
    if (req.body.body !== undefined) announcement.body = String(req.body.body).trim();
    announcement.startsAt = dates.startsAt;
    announcement.endsAt = dates.endsAt;
    if (req.body.isActive !== undefined) announcement.isActive = Boolean(req.body.isActive);
    await announcement.save();

    res.json({ announcement: presentAnnouncement(announcement) });
  } catch (err) {
    next(err);
  }
});

router.delete('/announcements/:id', async (req, res, next) => {
  try {
    const announcement = await byId(Announcement, req.params.id, 'Announcement not found.', res);
    if (!announcement) return;
    await announcement.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- accounts (ADM-3) ------------------------------ */

/** Students only, newest first, searchable — and never a transaction count (ADM-5). */
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(5, Number(req.query.perPage) || 20));
    const filter = { role: 'student' };

    const q = String(req.query.q || '').trim();
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: { $regex: safe, $options: 'i' } }, { email: { $regex: safe, $options: 'i' } }];
    }

    const [rows, total] = await Promise.all([
      User.find(filter)
        .select('name email isActive createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      User.countDocuments(filter),
    ]);

    res.json({
      rows: rows.map(presentUser),
      pagination: { page, perPage, total, pages: Math.max(1, Math.ceil(total / perPage)) },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/disable', (req, res, next) => setAccountState(req, res, next, false));
router.post('/users/:id/enable', (req, res, next) => setAccountState(req, res, next, true));

async function setAccountState(req, res, next, active) {
  try {
    if (!active && req.params.id === req.user._id.toString()) {
      // Locking yourself out mid-session helps nobody.
      return res.status(400).json({ error: 'You cannot disable your own account.' });
    }
    const user = await studentAccount(req, res);
    if (!user) return;

    user.isActive = active;
    await user.save();
    res.json({ user: presentUser(user) });
  } catch (err) {
    next(err);
  }
}

/** Trigger a password reset exactly like the public flow does (ADM-3, AUTH-5). */
router.post('/users/:id/reset', async (req, res, next) => {
  try {
    const user = await studentAccount(req, res);
    if (!user) return;

    const { token, hash, expires } = newResetToken();
    user.resetTokenHash = hash;
    user.resetTokenExpires = expires;
    await user.save();

    await sendMail({
      to: user.email,
      subject: 'Reset your Campus Coin password',
      text:
        `Hi ${user.name},\n\n` +
        `An administrator asked us to send you a password reset link.\n` +
        `Open the link below within the next hour to choose a new one:\n` +
        `${env.appUrl}/reset-password/${token}\n\n` +
        `If this was unexpected, you can ignore this message — nothing has changed.`,
    });

    // Same wording the public request returns: nothing here says whether
    // the address exists.
    res.json({ ok: true, message: 'If that address has an account, a reset link is on its way.' });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- helpers ------------------------------------ */

async function studentAccount(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Student not found.' });
    return null;
  }
  const user = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!user) {
    res.status(404).json({ error: 'Student not found.' });
    return null;
  }
  return user;
}

async function defaultCategory(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Category not found.' });
    return null;
  }
  const category = await Category.findOne({ _id: req.params.id, user: null, isDefault: true });
  if (!category) {
    res.status(404).json({ error: 'Category not found.' });
    return null;
  }
  return category;
}

async function byId(Model, id, message, res) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: message });
    return null;
  }
  const doc = await Model.findById(id);
  if (!doc) {
    res.status(404).json({ error: message });
    return null;
  }
  return doc;
}

/** Name present, ≤60, valid type, unique among defaults regardless of casing. */
async function defaultCategoryProblem(body, ignoringId = null) {
  const name = String(body.name || '').trim();
  const type = String(body.type || '').trim();

  if (!name) return 'Please enter a category name.';
  if (name.length > 60) return 'Category names can be at most 60 characters.';
  if (!['income', 'expense'].includes(type)) return 'Type must be income or expense.';

  const clash = await Category.findOne({
    user: null,
    isDefault: true,
    type,
    nameKey: name.toLowerCase(),
    ...(ignoringId ? { _id: { $ne: ignoringId } } : {}),
  });
  if (clash) return 'A default category with that name already exists for this type.';
  return null;
}

async function templateProblem(body, ignoringId = null) {
  const code = String(body.code || '').trim().toLowerCase();
  const kind = String(body.kind || 'tip');
  const title = String(body.title || '').trim();
  const bodyTemplate = String(body.bodyTemplate || '');

  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(code)) {
    return 'Codes use lowercase letters, numbers, dashes or underscores — 2 to 40 characters.';
  }
  if (!['tip', 'announcement'].includes(kind)) return 'Kind must be tip or announcement.';
  if (!title) return 'Please enter a title.';
  if (title.length > 120) return 'Titles can be at most 120 characters.';
  if (!bodyTemplate.trim()) return 'Please enter the message body.';
  if (bodyTemplate.length > 500) return 'The message body can be at most 500 characters.';

  const clash = await TipTemplate.findOne({ code, ...(ignoringId ? { _id: { $ne: ignoringId } } : {}) });
  if (clash) return 'Another template already uses that code.';
  return null;
}

/** Shared validation for create and edit; falls back to the stored dates. */
async function announcementDates(body, res, existing = null) {
  const title = String(body.title ?? existing?.title ?? '').trim();
  const text = String(body.body ?? existing?.body ?? '').trim();
  if (!title) {
    res.status(400).json({ error: 'Please enter a title.' });
    return null;
  }
  if (title.length > 120) {
    res.status(400).json({ error: 'Titles can be at most 120 characters.' });
    return null;
  }
  if (!text) {
    res.status(400).json({ error: 'Please enter a message.' });
    return null;
  }
  if (text.length > 1000) {
    res.status(400).json({ error: 'Messages can be at most 1000 characters.' });
    return null;
  }

  const startsAt = body.startsAt === undefined ? existing?.startsAt || new Date() : new Date(body.startsAt);
  const endsAt = body.endsAt === undefined ? existing?.endsAt ?? null : body.endsAt ? new Date(body.endsAt) : null;

  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    res.status(400).json({ error: 'Please pick valid dates.' });
    return null;
  }
  if (endsAt && endsAt < startsAt) {
    res.status(400).json({ error: 'The end date cannot come before the start date.' });
    return null;
  }
  return { startsAt, endsAt };
}

function cleanIcon(value) {
  return String(value || '').trim().slice(0, 30);
}

function presentCategory(c) {
  return {
    id: c._id.toString(),
    name: c.name,
    type: c.type,
    icon: c.icon,
    isActive: c.isActive,
    isDefault: c.isDefault,
  };
}

function presentTemplate(t) {
  return {
    id: t._id.toString(),
    code: t.code,
    kind: t.kind,
    title: t.title,
    bodyTemplate: t.bodyTemplate,
    isActive: t.isActive,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function presentAnnouncement(a) {
  return {
    id: a._id.toString(),
    title: a.title,
    body: a.body,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    isActive: a.isActive,
    createdBy: a.createdBy,
  };
}

function presentUser(u) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

export default router;
