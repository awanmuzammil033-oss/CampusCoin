import TipTemplate from '../models/TipTemplate.js';
import UserTip from '../models/UserTip.js';
import Budget, { monthStart } from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import { toNum, round2 } from '../utils/money.js';

/**
 * Personalised saving tips (TIP-1..3), architecture §6.4.
 *
 * The engine is a set of plain rules over this person's own numbers:
 * each rule looks at one slice of the month (a category, the pace, the
 * weekend) and, when it fires, produces a candidate with an estimated
 * saving. Candidates are ranked by that estimate — biggest wins first —
 * and stored so a dismissed tip stays gone for the rest of the month.
 *
 * Wording comes from TipTemplate rows when administrators have edited them,
 * otherwise from the fallbacks below. That way the feature works on a fresh
 * install and still lets a coordinator reword it later.
 */

const FALLBACK_TEMPLATES = {
  over_trend: {
    title: '{{category}} is running high',
    body: 'You are on track to spend {{projected}} on {{category}} this month — your usual is {{average}}. Cap it at {{cap}} a week and you would keep about {{saving}}.',
  },
  budget_pace: {
    title: 'Pace check on {{category}}',
    body: 'You have used {{pct}}% of your {{category}} budget with {{daysLeft}} days still to go. Slowing down to about {{cap}} a week would keep you inside {{limit}}.',
  },
  top_category: {
    title: '{{category}} takes the biggest slice',
    body: '{{category}} is {{pct}}% of this month\'s spending. Trim it by a tenth and you would keep about {{saving}}.',
  },
  subscriptions: {
    title: 'Subscriptions add up',
    body: 'Recurring subscriptions come to {{total}} this month — that is {{pct}}% of your income. Reviewing what you still use could return about {{saving}}.',
  },
  savings_gap: {
    title: 'Savings goal in reach',
    body: 'You have saved {{saved}} of your {{goal}} goal so far. {{gap}} more before the month ends would put you back on track.',
  },
  weekend_spike: {
    title: 'Weekends cost more',
    body: 'Your weekend spending averages {{weekendAvg}} a day against {{weekdayAvg}} on weekdays. Planning the next weekends could keep about {{saving}} in your pocket.',
  },
};

/* ------------------------------ public entry --------------------------------- */

/**
 * Generate (or refresh) this month's tips. Safe to call any number of times:
 * rows already dismissed or pinned are kept exactly as the person left them.
 */
export async function ensureTipsForMonth(user, at = new Date()) {
  const month = monthStart(at);
  const candidates = await buildCandidates(user, month, at);

  const existing = await UserTip.find({ user: user._id, month });
  const byKey = new Map(existing.map((t) => [keyOf(t), t]));

  for (const candidate of candidates) {
    const k = `${candidate.template}|${candidate.category ?? 'none'}`;
    if (byKey.has(k)) {
      // Keep the person's decision (dismissed stays dismissed) but refresh
      // the wording and estimate — numbers move during the month.
      const row = byKey.get(k);
      if (row.status === 'active') {
        row.textRendered = candidate.textRendered;
        row.potentialSavings = candidate.potentialSavings;
        await row.save();
      }
      continue;
    }
    try {
      await UserTip.create({ user: user._id, month, status: 'active', ...candidate });
    } catch (err) {
      if (err.code !== 11000) throw err; // duplicate from a parallel call — fine
    }
  }

  return listTips(user, month);
}

/** Dashboard strip (DASH-2): pinned first, then biggest saving, top three. */
export async function topTips(user, at = new Date()) {
  const month = monthStart(at);
  const rows = await UserTip.find({
    user: user._id,
    month,
    status: { $in: ['active', 'pinned'] },
  });
  return rank(rows).slice(0, 3);
}

export async function listTips(user, month) {
  const rows = await UserTip.find({ user: user._id, month });
  return rank(rows);
}

async function setTipState(user, tipId, patch) {
  const tip = await UserTip.findOne({ _id: tipId, user: user._id });
  if (!tip) return null;
  Object.assign(tip, patch);
  await tip.save();
  return tip;
}

export const dismissTip = (user, id) => setTipState(user, id, { status: 'dismissed' });
export const pinTip = (user, id) => setTipState(user, id, { status: 'pinned' });
export const unpinTip = (user, id) => setTipState(user, id, { status: 'active' });
export const bookmarkTip = (user, id, bookmarked = true, note = null) =>
  setTipState(user, id, { isBookmarked: bookmarked, note: note === undefined ? undefined : note });

/* -------------------------------- the rules ---------------------------------- */

async function buildCandidates(user, month, at) {
  const facts = await gatherFacts(user, month, at);
  const rules = [
    overTrendRule,
    budgetPaceRule,
    topCategoryRule,
    subscriptionsRule,
    savingsGapRule,
    weekendSpikeRule,
  ];

  const templates = await loadTemplates();
  const candidates = [];

  for (const rule of rules) {
    const hit = rule(facts);
    if (!hit) continue;
    const template = templates[hit.code] || FALLBACK_TEMPLATES[hit.code];
    if (!template) continue;

    candidates.push({
      template: template.templateId || (await ensureStandaloneTemplate(hit.code)),
      category: hit.categoryId || null,
      potentialSavings: hit.saving > 0 ? round2(hit.saving) : null,
      textRendered: render(template.body, hit.vars),
    });
  }

  return candidates;
}

/** Everything the rules need, computed in the database — never row loops. */
async function gatherFacts(user, month, at) {
  const prevStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 3, 1));
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const today = at.getUTCDate();
  const daysInMonth = new Date(nextMonth.getTime() - 1).getUTCDate();
  const daysElapsed = Math.max(1, Math.min(today, daysInMonth));

  const [byMonthCategory, monthTypeTotals, dayRows, budgets] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          user: user._id,
          isDeleted: false,
          type: 'expense',
          date: { $gte: prevStart, $lt: nextMonth },
        },
      },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, category: '$category' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { user: user._id, isDeleted: false, date: { $gte: prevStart, $lt: nextMonth } } },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          user: user._id,
          isDeleted: false,
          type: 'expense',
          date: { $gte: month, $lt: nextMonth },
        },
      },
      {
        $group: {
          _id: { day: { $dayOfWeek: '$date' }, category: '$category' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Budget.find({ user: user._id, month }).populate('category', 'name type'),
  ]);

  const monthKey = monthKeyOf(month);
  const previousKeys = [1, 2, 3].map((back) => {
    const d = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - back, 1));
    return monthKeyOf(d);
  });

  // Category totals for the current month and the average of the last three.
  const current = new Map();
  const historyTotals = new Map();
  for (const row of byMonthCategory) {
    const catId = String(row.category ?? row._id.category);
    const amount = toNum(row.total);
    if (row._id.month === monthKey) current.set(catId, amount);
    if (previousKeys.includes(row._id.month)) {
      const bucket = historyTotals.get(catId) || new Map();
      bucket.set(row._id.month, amount);
      historyTotals.set(catId, bucket);
    }
  }

  const categoryNames = await loadCategoryNames(user._id);
  const avg3 = new Map();
  for (const [catId, bucket] of historyTotals) {
    avg3.set(catId, round2([...bucket.values()].reduce((a, b) => a + b, 0) / 3));
  }

  const income = sumOfType(monthTypeTotals, monthKey, 'income');
  const expense = sumOfType(monthTypeTotals, monthKey, 'expense');

  let weekendTotal = 0;
  let weekdayTotal = 0;
  for (const row of dayRows) {
    const dow = row._id.day; // 1 = Sunday, 7 = Saturday (UTC default)
    if (dow === 1 || dow === 7) weekendTotal += toNum(row.total);
    else weekdayTotal += toNum(row.total);
  }

  return {
    month,
    today,
    daysInMonth,
    daysElapsed,
    daysLeft: Math.max(0, daysInMonth - today),
    current,
    avg3,
    categoryNames,
    income,
    expense,
    saved: round2(income - expense),
    savingsGoal: toNum(user.monthlySavingsGoal) || 0,
    budgets: budgets.map((b) => ({
      categoryId: b.category?._id.toString(),
      name: b.category?.name || '',
      limit: toNum(b.limitAmount),
      spent: current.get(b.category?._id.toString()) || 0,
    })),
    weekendTotal,
    weekdayTotal,
    weekendDaysInMonth: countWeekends(month, daysInMonth),
  };
}

function overTrendRule(f) {
  for (const [catId, projectedRaw] of f.current) {
    const avg = f.avg3.get(catId) || 0;
    if (avg < 5) continue; // too small to be worth advising on
    const spent = projectedRaw;
    const projected = round2((spent / f.daysElapsed) * f.daysInMonth);
    if (projected <= avg * 1.15) continue;

    const saving = round2(projected - avg);
    if (saving <= 0.5) continue;
    return {
      code: 'over_trend',
      categoryId: catId,
      saving,
      vars: {
        category: f.categoryNames.get(catId) || 'This category',
        projected: money(projected),
        average: money(avg),
        cap: money(round2(avg / 4.3)),
        saving: money(saving),
      },
    };
  }
  return null;
}

function budgetPaceRule(f) {
  if (f.today >= 21) return null; // early-month pace only
  for (const b of f.budgets) {
    if (!b.limit || !b.categoryId) continue;
    const pct = Math.round((b.spent / b.limit) * 100);
    if (pct <= 80) continue;

    const projected = round2((b.spent / f.daysElapsed) * f.daysInMonth);
    const saving = round2(Math.max(0, projected - b.limit));
    return {
      code: 'budget_pace',
      categoryId: b.categoryId,
      saving,
      vars: {
        category: b.name,
        pct,
        daysLeft: f.daysLeft,
        cap: money(round2(b.limit / 4.3)),
        limit: money(b.limit),
      },
    };
  }
  return null;
}

function topCategoryRule(f) {
  if (f.expense <= 0 || f.current.size === 0) return null;
  const [catId, spent] = [...f.current.entries()].sort((a, b) => b[1] - a[1])[0];
  const pct = Math.round((spent / f.expense) * 100);
  if (pct <= 40) return null;

  const saving = round2(spent * 0.1);
  if (saving <= 0.5) return null;
  return {
    code: 'top_category',
    categoryId: catId,
    saving,
    vars: { category: f.categoryNames.get(catId) || 'Your top category', pct, saving: money(saving) },
  };
}

function subscriptionsRule(f) {
  if (f.income <= 0) return null;
  let subs = 0;
  let subsId = null;
  for (const [catId, amount] of f.current) {
    const name = (f.categoryNames.get(catId) || '').toLowerCase();
    if (name.includes('subscription')) {
      subs += amount;
      subsId = catId;
    }
  }
  if (!subs) return null;

  const pct = Math.round((subs / f.income) * 100);
  if (pct <= 10) return null;

  const saving = round2(subs * 0.2);
  return {
    code: 'subscriptions',
    categoryId: subsId,
    saving,
    vars: { total: money(subs), pct, saving: money(saving) },
  };
}

function savingsGapRule(f) {
  if (!f.savingsGoal || f.saved >= f.savingsGoal) return null;
  const gap = round2(f.savingsGoal - f.saved);
  if (gap <= 0.5) return null;
  return {
    code: 'savings_gap',
    saving: gap,
    vars: { saved: money(f.saved), goal: money(f.savingsGoal), gap: money(gap) },
  };
}

function weekendSpikeRule(f) {
  const weekendDaysLeft = remainingWeekendDays(f);
  if (f.daysElapsed < 7 || weekendDaysLeft === 0) return null;

  const weekendDaysSoFar = Math.max(1, f.weekendDaysInMonth - weekendDaysLeft);
  const weekdayDaysSoFar = Math.max(1, f.daysElapsed - weekendDaysSoFar);

  const weekendAvg = f.weekendTotal / weekendDaysSoFar;
  const weekdayAvg = f.weekdayTotal / weekdayDaysSoFar;
  if (weekdayAvg <= 0 || weekendAvg <= weekdayAvg * 1.5) return null;

  const saving = round2((weekendAvg - weekdayAvg) * weekendDaysLeft);
  if (saving <= 0.5) return null;
  return {
    code: 'weekend_spike',
    saving,
    vars: {
      weekendAvg: money(weekendAvg),
      weekdayAvg: money(weekdayAvg),
      saving: money(saving),
    },
  };
}

/* --------------------------------- helpers ----------------------------------- */

function rank(rows) {
  return rows.sort((a, b) => {
    if (a.status === 'pinned' && b.status !== 'pinned') return -1;
    if (b.status === 'pinned' && a.status !== 'pinned') return 1;
    const sa = Number(a.potentialSavings?.$numberDecimal ?? a.potentialSavings ?? 0);
    const sb = Number(b.potentialSavings?.$numberDecimal ?? b.potentialSavings ?? 0);
    return sb - sa;
  });
}

function keyOf(storedRow) {
  return `${storedRow.template}|${storedRow.category ?? 'none'}`;
}

async function loadTemplates() {
  const rows = await TipTemplate.find({ kind: 'tip', isActive: true });
  const map = new Map();
  for (const t of rows) map.set(t.code, { title: t.title, body: t.bodyTemplate, templateId: t._id });
  return map;
}

async function ensureStandaloneTemplate(code) {
  const fallback = FALLBACK_TEMPLATES[code];
  const existing = await TipTemplate.findOne({ code });
  if (existing) return existing._id;
  const created = await TipTemplate.create({
    code,
    kind: 'tip',
    title: fallback.title,
    bodyTemplate: fallback.body,
    isActive: true,
  });
  return created._id;
}

async function loadCategoryNames(userId) {
  const { default: Category } = await import('../models/Category.js');
  const rows = await Category.find({ $or: [{ user: userId }, { user: null }] }).select('name');
  return new Map(rows.map((c) => [c._id.toString(), c.name]));
}

function render(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) =>
    vars[name] !== undefined ? String(vars[name]) : ''
  );
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function sumOfType(rows, monthKey, type) {
  const row = rows.find((r) => r._id.month === monthKey && r._id.type === type);
  return round2(toNum(row?.total ?? 0));
}

function monthKeyOf(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function countWeekends(month, daysInMonth) {
  let saturdays = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dow = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), d)).getUTCDay();
    if (dow === 0 || dow === 6) saturdays += 1;
  }
  return saturdays;
}

function remainingWeekendDays(f) {
  let count = 0;
  for (let d = f.today; d <= f.daysInMonth; d += 1) {
    const dow = new Date(Date.UTC(f.month.getUTCFullYear(), f.month.getUTCMonth(), d)).getUTCDay();
    if (dow === 0 || dow === 6) count += 1;
  }
  return count;
}
