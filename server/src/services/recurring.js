import mongoose from 'mongoose';
import RecurringRule from '../models/RecurringRule.js';
import Category from '../models/Category.js';
import { createTransaction } from './ledger.js';
import { toDec, isPositiveAmount } from '../utils/money.js';

/**
 * Recurring entries (TXN-3), architecture §6.2.
 *
 * The generator is deliberately boring: for every active rule it computes the
 * dates that should exist between `lastGeneratedOn` and today, creates the
 * missing ones, then advances `lastGeneratedOn`. Running it five times in a
 * row on the same morning therefore creates nothing extra the second time —
 * the cursor only moves forward.
 */

export async function generateForUser(user) {
  const rules = await RecurringRule.find({ user: user._id, isActive: true });
  let created = 0;

  for (const rule of rules) {
    created += await generateRule(user, rule);
  }
  return created;
}

/** Used by the daily job (scripts/generate-recurring.js) across all users. */
export async function generateForEveryone() {
  const rules = await RecurringRule.find({ isActive: true }).populate('user');
  let created = 0;
  const byUser = new Map();

  for (const rule of rules) {
    if (!rule.user || !rule.user.isActive) continue;
    if (!byUser.has(rule.user._id.toString())) byUser.set(rule.user._id.toString(), rule.user);
    const user = byUser.get(rule.user._id.toString());
    created += await generateRule(user, rule);
  }
  return created;
}

async function generateRule(user, rule) {
  const today = startOfDay(new Date());
  const start = startOfDay(rule.startDate);
  const end = rule.endDate ? startOfDay(rule.endDate) : today;
  const cursor = rule.lastGeneratedOn ? addDays(startOfDay(rule.lastGeneratedOn), 1) : start;

  let created = 0;
  let next = cursor;

  while (next <= today && next <= end) {
    const { default: Transaction } = await import('../models/Transaction.js');
    const exists = await Transaction.exists({
      user: user._id,
      recurringRule: rule._id,
      date: next,
      isDeleted: false,
    });

    if (!exists) {
      await createTransaction(user, {
        categoryId: rule.category,
        amount: Number(rule.amount.$numberDecimal ?? rule.amount).toFixed(2),
        type: rule.type,
        description: rule.description,
        date: next,
        recurringRule: rule._id,
      });
      created += 1;
    }

    rule.lastGeneratedOn = next;
    next = nextDate(rule, next);
  }

  // A paused or finished rule stops being walked even if dates remain.
  if (rule.endDate && startOfDay(rule.endDate) <= today) rule.isActive = false;
  await rule.save();
  return created;
}

/** Next occurrence: +7 days for weekly, same day next month (clamped) for monthly. */
function nextDate(rule, from) {
  if (rule.frequency === 'weekly') return addDays(from, 7);

  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + 1;
  const target = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(rule.dayOfPeriod, lastDay);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day));
}

/* ---------------------------------- CRUD -------------------------------------- */

export async function listRules(user) {
  const rules = await RecurringRule.find({ user: user._id })
    .sort({ isActive: -1, startDate: -1 })
    .populate('category', 'name type icon');
  return rules;
}

export async function createRule(user, body) {
  const problem = validate(body);
  if (problem) throw badRequest(problem);

  const category = await ownableCategory(user, body.categoryId, body.type);
  const start = startOfDay(body.startDate || Date.now());

  return RecurringRule.create({
    user: user._id,
    category: category._id,
    type: body.type,
    amount: toDec(body.amount),
    description: String(body.description || '').trim().slice(0, 255),
    frequency: body.frequency,
    dayOfPeriod: body.frequency === 'monthly' ? Math.min(31, start.getUTCDate()) : 1,
    startDate: start,
    endDate: body.endDate ? startOfDay(body.endDate) : null,
    lastGeneratedOn: null,
    isActive: true,
  });
}

export async function updateRule(user, ruleId, body) {
  const rule = await ownRule(user, ruleId);
  if (body.description !== undefined) rule.description = String(body.description).trim().slice(0, 255);
  if (body.amount !== undefined) {
    if (!isPositiveAmount(body.amount)) throw badRequest('Amount must be more than 0.');
    rule.amount = toDec(body.amount);
  }
  if (body.categoryId !== undefined || body.type !== undefined) {
    const type = body.type ?? rule.type;
    const category = await ownableCategory(user, body.categoryId ?? rule.category, type);
    rule.category = category._id;
    rule.type = type;
  }
  if (body.endDate !== undefined) rule.endDate = body.endDate ? startOfDay(body.endDate) : null;
  if (body.isActive !== undefined) rule.isActive = Boolean(body.isActive);
  await rule.save();
  return rule;
}

export async function removeRule(user, ruleId) {
  const rule = await ownRule(user, ruleId);
  // History stays: transactions already generated keep pointing at the rule
  // so the UI can still show where they came from.
  rule.isActive = false;
  rule.endDate = startOfDay(new Date());
  await rule.save();
  return rule;
}

async function ownRule(user, ruleId) {
  if (!mongoose.isValidObjectId(ruleId)) throw notFound();
  const rule = await RecurringRule.findOne({ _id: ruleId, user: user._id });
  if (!rule) throw notFound();
  return rule;
}

async function ownableCategory(user, categoryId, type) {
  if (!mongoose.isValidObjectId(categoryId)) throw badRequest('Please choose a category.');
  const category = await Category.findOne({
    _id: categoryId,
    $or: [{ user: user._id }, { user: null, isDefault: true }],
    isActive: true,
  });
  if (!category) throw badRequest('That category does not exist.');
  if (category.type !== type) throw badRequest(`"${category.name}" is an ${category.type} category.`);
  return category;
}

function validate(body) {
  if (!['weekly', 'monthly'].includes(body.frequency)) return 'Repeat frequency must be weekly or monthly.';
  if (!['income', 'expense'].includes(body.type)) return 'Type must be income or expense.';
  if (!isPositiveAmount(body.amount)) return 'Amount must be more than 0 with at most 2 decimals.';
  return null;
}

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error('Recurring rule not found.');
  err.status = 404;
  return err;
}
