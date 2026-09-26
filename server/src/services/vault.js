import mongoose from 'mongoose';
import RecurringRule from '../models/RecurringRule.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import Notification from '../models/Notification.js';
import { toNum, round2, formatMoney } from '../utils/money.js';

/**
 * The subscription & leak detector vault.
 *
 * One screen answers the question a student cannot answer from the ledger
 * alone: "how much leaves my account every month for things I keep paying
 * for, and which of those am I not even using?" Every number below comes from
 * a database aggregate — the charges are folded into one row per
 * subscription inside MongoDB, and JavaScript only ever decides what to call
 * that row (the verdict), never adds up money.
 *
 * The two ingredients:
 *  - RecurringRule rows: the student set the payment up, so it will auto-renew.
 *  - Transactions: the evidence. A charge pattern that repeats on a steady
 *    beat is a subscription even when no rule exists, which is exactly how
 *    leaks nobody set up get found.
 *
 * A subscription is one of two things, and the pipeline decides which before
 * any row is judged:
 *   rule:<ruleId>            charges the generator made for a recurring entry
 *   words:<words>@<category> charges that repeat the same words, with no rule
 *
 * Every detection is explainable, and the rules are constants at the top of
 * the file (see VAULT_RULES) — they are handed to the client in the report so
 * the page can say which threshold fired, and the tests assert against them.
 *
 * Requires MongoDB 5.0+ (the cadence test uses $setWindowFields / $shift).
 */

/* ------------------------------- thresholds -------------------------------- */

/**
 * The whole rule set, in one place. Chosen for a student on a small monthly
 * budget, and each number has a reason:
 *
 *  lookbackDays 400   ~13 months of charges, so "the last 12 months" has real
 *                    history behind it and a price rise has two ends to
 *                    compare. Nothing older can still be charging.
 *  activeDays    45   a monthly payment that is 45 days late is simply late,
 *                    not abandoned. Inside this window a charge pattern counts
 *                    as still running, and that is also the default in-use
 *                    answer for a rule.
 *  idleDays      30   one whole billing period with no charge is the first
 *                    moment a subscription can honestly be called unused. It
 *                    sits inside activeDays on purpose: a payment 35 days old
 *                    is both recent and overdue, and the more useful of the
 *                    two things to say about it is "you are still paying".
 *  liveDays     120   a pattern with no rule that has been quiet for four
 *                    months has already stopped; it is history, not a leak.
 *  creepPct      10   a 10% rise is the point where a price change is worth
 *                    mentioning; 5% on $4 is noise. Paired with creepFloor so
 *                    a 10% rise on a tiny amount cannot raise a lecture.
 *  duplicatePct  10   two subscriptions in one category within 10% of each
 *                    other (or $1 of each other) and sharing a word in their
 *                    names are the same thing paid twice.
 *  pattern*            a no-rule charge only counts as a subscription when it
 *                    repeats at least 3 times in a year, never sits still for
 *                    more than 45 days, and keeps a steady beat (the gap
 *                    between charges wobbles by at most half the gap itself).
 *                    This is what keeps "coffee, 4 times this month" out of a
 *                    screen about subscriptions.
 *  reminderDays  30   one reminder per subscription per month, matching the
 *                    monthly rhythm of the payments themselves.
 */
export const VAULT_RULES = Object.freeze({
  lookbackDays: 400,
  activeDays: 45,
  idleDays: 30,
  liveDays: 120,
  creepPct: 10,
  creepFloor: 1,
  duplicatePct: 10,
  duplicateFloor: 1,
  patternMinCharges: 3,
  patternMaxGapDays: 45,
  patternGapSpread: 0.5,
  reminderDays: 30,
});

const DAY = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365;
/** 52 weeks in 12 months — the same approximation insight.js uses. */
const WEEKS_PER_MONTH = 52 / 12;

/* --------------------------------- report ---------------------------------- */

/**
 * The whole picture for one person. Nothing here reads another student's rows:
 * every query is keyed on `user`, and the rules are matched on (rule, user).
 */
export async function vaultReport(user) {
  const today = startOfDay(new Date());

  const [charges, rules, committed] = await Promise.all([
    chargeGroups(user._id, today),
    listExpenseRules(user._id),
    committedMonthly(user._id),
  ]);

  const subscriptions = collectSubscriptions(charges, rules);
  flagDuplicates(subscriptions);
  subscriptions.forEach(judge);

  // "How much goes out every month" is the sum of the cards on screen, so the
  // headline can always be checked against the list below it. Each row's
  // monthly figure is money already (one aggregate divided once, rounded once)
  // and the totals are rounded once at the edge — the same shape as the
  // three-month baseline in insight.js.
  const detected = subscriptions
    .sort(
      (a, b) =>
        verdictRank(a.verdict) - verdictRank(b.verdict) ||
        b.monthly - a.monthly ||
        a.key.localeCompare(b.key)
    )
    .map(publicRow);

  const monthlyTotal = round2(sum(detected.map((s) => s.monthly)));
  const annualTotal = round2(sum(detected.map((s) => s.annual)));

  const cancelIdle = round2(
    sum(detected.filter((s) => s.verdict === 'idle' && s.active).map((s) => s.monthly))
  );
  const cutDuplicates = round2(
    sum(detected.filter((s) => s.verdict === 'duplicate' && s.active).map((s) => s.monthly))
  );
  const savingsTotal = round2(cancelIdle + cutDuplicates);

  return {
    generatedAt: new Date().toISOString(),
    monthlyTotal,
    annualTotal,
    committedMonthly: committed,
    count: detected.length,
    flaggedCount: detected.filter((s) => s.verdict !== 'in-use').length,
    detected,
    alerts: buildAlerts(detected),
    savings: {
      cancelIdle,
      cutDuplicates,
      total: savingsTotal,
      annual: round2(savingsTotal * 12),
    },
    rules: { ...VAULT_RULES },
  };
}

/** Just the headline numbers, for a small card on another screen. */
export async function vaultSummary(user) {
  const report = await vaultReport(user);
  const tally = { idle: 0, duplicate: 0, 'price-creep': 0, 'one-off': 0 };

  for (const row of report.detected) if (tally[row.verdict] !== undefined) tally[row.verdict] += 1;

  return {
    monthlyTotal: report.monthlyTotal,
    annualTotal: report.annualTotal,
    committedMonthly: report.committedMonthly,
    count: report.count,
    flaggedCount: report.flaggedCount,
    verdicts: tally,
    savings: report.savings,
  };
}

/* ------------------------------- reminders --------------------------------- */

/**
 * Proactive reminders, called opportunistically by the route on every read.
 *
 * One reminder per idle subscription per VAULT_RULES.reminderDays, which is
 * what keeps a page that runs this on every load quiet. The unique index that
 * guards the budget alerts does not cover this kind, so the de-duplication is
 * done here: the reminder's message starts with the subscription's own name,
 * and a name already seen in the last 30 days is skipped. Two subscriptions
 * that share a name therefore share a reminder — the friendlier outcome, and
 * impossible to spam because the window is a month, not a session.
 *
 * A report built just before can be handed in, so a caller that is about to
 * show it anyway does not pay for the aggregates twice.
 */
export async function scanAndRemind(user, existingReport) {
  const report = existingReport || (await vaultReport(user));
  const idle = report.detected.filter((s) => s.verdict === 'idle');
  if (idle.length === 0) return { created: 0, idle: 0 };

  const since = new Date(Date.now() - VAULT_RULES.reminderDays * DAY);
  const recent = await Notification.find({ user: user._id, kind: 'system', createdAt: { $gte: since } })
    .select('message')
    .lean();

  const seen = new Set(recent.map((row) => reminderStamp(String(row.message || ''))));
  let created = 0;

  for (const sub of idle) {
    const message = reminderMessage(sub);
    if (seen.has(reminderStamp(message))) continue;

    try {
      await Notification.create({
        user: user._id,
        kind: 'system',
        message,
        category: sub.category.id,
      });
      seen.add(reminderStamp(message));
      created += 1;
    } catch (err) {
      // 11000 would mean a unique index did its job; anything else is real.
      if (err.code !== 11000) throw err;
    }
  }

  return { created, idle: idle.length };
}

/* --------------------------------- cancel ---------------------------------- */

/**
 * "Cancel this" from the vault: the entry stops, and the entries it already
 * generated stay in the ledger with their history (same rule as
 * services/recurring.js — a subscription is a fact about the past too).
 * Scoped to the owner, and idempotent so a double click cannot fail.
 */
export async function cancelSubscription(user, ruleId) {
  const id = String(ruleId || '').trim();
  if (!id) throw badRequest('Please choose a recurring entry to cancel.');
  if (!mongoose.isValidObjectId(id)) throw badRequest('That recurring entry id is not valid.');

  const rule = await RecurringRule.findOne({ _id: id, user: user._id });
  if (!rule) throw notFound('That recurring entry was not found.');

  const wasActive = rule.isActive;
  if (wasActive) {
    rule.isActive = false;
    rule.endDate = startOfDay(new Date());
    await rule.save();
  }
  return { id: rule._id.toString(), title: rule.description, wasActive };
}

/* ------------------------------ the aggregate ------------------------------ */

/**
 * Fold this person's subscription charges into one row per subscription.
 *
 * Stage by stage:
 *  1. match   — only their own, undeleted expenses inside the lookback window.
 *  2. words   — lowercase letters and numbers out of the description
 *               ("Netflix  Premium!" -> "netflix premium"), the same rule as
 *               services/anomaly.js so both screens group alike.
 *  3. groupKey— a charge made by the generator belongs to its rule, a charge
 *               made by hand belongs to its words + category. A charge with no
 *               words and no rule has nothing to group by and is dropped:
 *               a category alone is not a subscription.
 *  4. sort    — by key, then by date, so $first/$last below are the earliest
 *               and the latest charge of the subscription.
 *  5. window  — the gap to the previous charge, which is how a steady beat is
 *               told apart from a habit.
 *  6. group   — one row per subscription: first/last charge and amount, how
 *               many charges, what the last 12 months cost, and the cadence.
 */
async function chargeGroups(userId, today) {
  const lookback = new Date(today.getTime() - VAULT_RULES.lookbackDays * DAY);
  const twelve = new Date(today.getTime() - YEAR_DAYS * DAY);

  const rows = await Transaction.aggregate([
    { $match: { user: userId, type: 'expense', isDeleted: false, date: { $gte: lookback } } },
    {
      $project: {
        category: 1,
        amount: 1,
        date: 1,
        description: 1,
        recurringRule: 1,
        words: {
          $trim: {
            input: {
              $reduce: {
                input: {
                  $map: {
                    input: {
                      $regexFindAll: {
                        input: { $toLower: { $ifNull: ['$description', ''] } },
                        regex: '[\\p{L}\\p{N}]+',
                      },
                    },
                    in: '$$this.match',
                  },
                },
                initialValue: '',
                in: { $concat: ['$$value', ' ', { $ifNull: ['$$this', ''] }] },
              },
            },
          },
        },
      },
    },
    {
      $set: {
        groupKey: {
          $cond: [
            { $ifNull: ['$recurringRule', false] },
            { $concat: ['rule:', { $toString: '$recurringRule' }] },
            {
              $cond: [
                { $eq: [{ $ifNull: ['$words', ''] }, ''] },
                '',
                { $concat: ['words:', '$words', '@', { $toString: '$category' }] },
              ],
            },
          ],
        },
      },
    },
    { $match: { groupKey: { $ne: '' } } },
    { $sort: { groupKey: 1, date: 1, amount: 1 } },
    {
      $setWindowFields: {
        partitionBy: '$groupKey',
        sortBy: { date: 1, amount: 1 },
        output: { previousCharge: { $shift: { output: '$date', by: -1, default: null } } },
      },
    },
    {
      $set: {
        gapMs: {
          $cond: [{ $eq: ['$previousCharge', null] }, null, { $subtract: ['$date', '$previousCharge'] }],
        },
      },
    },
    {
      $group: {
        _id: '$groupKey',
        title: { $first: '$description' },
        words: { $first: '$words' },
        category: { $first: '$category' },
        charges: { $sum: 1 },
        charges12: { $sum: { $cond: [{ $gte: ['$date', twelve] }, 1, 0] } },
        spent12: { $sum: { $cond: [{ $gte: ['$date', twelve] }, '$amount', 0] } },
        firstDate: { $min: '$date' },
        lastDate: { $max: '$date' },
        firstAmount: { $first: '$amount' },
        lastAmount: { $last: '$amount' },
        averageGap: { $avg: '$gapMs' },
        shortestGap: { $min: '$gapMs' },
        longestGap: { $max: '$gapMs' },
      },
    },
  ]);

  return rows.map((row) => ({
    key: row._id,
    title: String(row.title || '').trim(),
    words: row.words || '',
    categoryId: String(row.category),
    isRuleGroup: row._id.startsWith('rule:'),
    ruleId: row._id.startsWith('rule:') ? row._id.slice('rule:'.length) : null,
    charges: row.charges,
    charges12: row.charges12,
    spent12: toNum(row.spent12) || 0,
    firstDate: row.firstDate,
    lastDate: row.lastDate,
    firstAmount: toNum(row.firstAmount) || 0,
    lastAmount: toNum(row.lastAmount) || 0,
    daysSince: daysBetween(row.lastDate, today),
    averageGap: row.averageGap === null ? null : row.averageGap / DAY,
    shortestGap: row.shortestGap === null ? null : row.shortestGap / DAY,
    longestGap: row.longestGap === null ? null : row.longestGap / DAY,
  }));
}

/** Rules that cost money: an allowance coming in is not a subscription. */
function listExpenseRules(userId) {
  return RecurringRule.find({ user: userId, type: 'expense' })
    .populate('category', 'name icon')
    .lean();
}

/** What the student is contractually committed to, straight from the rules. */
async function committedMonthly(userId) {
  const rows = await RecurringRule.aggregate([
    { $match: { user: userId, type: 'expense', isActive: true } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [
              { $eq: ['$frequency', 'weekly'] },
              { $divide: [{ $multiply: ['$amount', 52] }, 12] },
              '$amount',
            ],
          },
        },
      },
    },
  ]);
  return rows.length ? round2(toNum(rows[0].total)) : 0;
}

/* ----------------------------- build the rows ------------------------------ */

/**
 * One row per subscription, from the reduced charges plus the rule behind it
 * (when there is one). Rules whose charges were logged by hand — the student
 * typed "Netflix" for six months and only then set up the entry — adopt the
 * matching charge pattern, so they are not counted twice. A rule with no
 * charges at all has nothing to detect; it is still counted in
 * `committedMonthly`, which is the number that promises money.
 */
function collectSubscriptions(charges, rules) {
  const byRule = new Map(charges.filter((c) => c.isRuleGroup).map((c) => [c.ruleId, c]));
  const patterns = charges.filter((c) => !c.isRuleGroup);
  const claimed = new Set();
  const rows = [];

  for (const rule of rules) {
    const ruleId = rule._id.toString();
    const own = byRule.get(ruleId);
    if (own) {
      claimed.add(own.key);
      rows.push(rowFromCharge(own, rule));
      continue;
    }

    const wanted = words(rule.description);
    if (!wanted) continue;
    const adopted = patterns.find(
      (p) => !claimed.has(p.key) && p.words === wanted && p.categoryId === String(rule.category?._id || rule.category)
    );
    if (adopted) {
      claimed.add(adopted.key);
      rows.push(rowFromCharge(adopted, rule));
    }
  }

  for (const pattern of patterns) {
    if (claimed.has(pattern.key)) continue;
    if (!isSteadySubscription(pattern)) continue;
    rows.push(rowFromCharge(pattern, null));
  }

  return rows;
}

/**
 * The gate for a charge pattern with no rule behind it: it has to behave like
 * a subscription, not like a habit. Three charges in the last year, never a
 * gap longer than six weeks, and a gap that stays inside half of itself
 * (a weekly bus pass wobbles by a day; a coffee habit wobbles by weeks).
 */
function isSteadySubscription(charge) {
  if (charge.charges12 < VAULT_RULES.patternMinCharges) return false;
  if (charge.daysSince > VAULT_RULES.liveDays) return false;
  if (charge.averageGap === null || charge.averageGap > VAULT_RULES.patternMaxGapDays) return false;
  const wobble = charge.longestGap - charge.shortestGap;
  return wobble <= charge.averageGap * VAULT_RULES.patternGapSpread;
}

function rowFromCharge(charge, rule) {
  const ruleId = rule ? rule._id.toString() : charge.ruleId;
  const category = rule?.category || null;
  const categoryId = String(category?._id || charge.categoryId);
  const name = words(rule?.description || charge.title || charge.words);

  // A rule states the price; without one the latest charge does.
  const amount = rule ? toNum(rule.amount) || 0 : charge.lastAmount;
  const frequency = rule ? rule.frequency : 'none';
  const monthly = rule ? monthlyOfRule(rule) : round2(charge.spent12 / 12);

  const from = charge.firstAmount;
  const to = charge.lastAmount;
  const growth = from > 0 ? round2(((to - from) / from) * 100) : 0;
  const creep =
    charge.charges >= 2 && to > from && growth >= VAULT_RULES.creepPct && to - from >= VAULT_RULES.creepFloor;

  return {
    key: charge.key,
    words: name,
    wordList: name ? name.split(' ') : [],
    title: String(rule?.description || charge.title || '').trim(),
    categoryId,
    categoryName: category?.name || null,
    categoryIcon: category?.icon || null,
    ruleId,
    hasRule: Boolean(ruleId),
    // A paused rule will not charge again. A pattern has no rule to ask, so
    // "still going" means it was charged inside the 45-day in-use window — a
    // pattern quiet for two months has already stopped on its own.
    active: rule ? Boolean(rule.isActive) : charge.daysSince <= VAULT_RULES.activeDays,
    amount: round2(amount),
    frequency,
    monthly,
    annual: round2(monthly * 12),
    lastCharge: charge.lastDate,
    daysSinceLastCharge: charge.daysSince,
    charges: charge.charges,
    charges12: charge.charges12,
    spent12: charge.spent12,
    averageGap: charge.averageGap === null ? null : round2(charge.averageGap),
    growth: { from: round2(from), to: round2(to), pct: Math.round(growth), creep },
    duplicateOf: null,
    duplicateOfTitle: null,
    verdict: 'in-use',
  };
}

/** A weekly entry is a monthly cost too: 52 weeks over 12 months. */
function monthlyOfRule(rule) {
  const amount = toNum(rule.amount) || 0;
  return rule.frequency === 'weekly' ? round2(amount * WEEKS_PER_MONTH) : round2(amount);
}

/* -------------------------------- verdicts --------------------------------- */

/**
 * Two live subscriptions in one category, charging nearly the same amount and
 * with a word in common in their names, are the same thing paid twice. The
 * one with a rule behind it (or the more recently charged one) is kept; the
 * rest are marked as the extra copy, which is the one worth cancelling.
 * Each row is marked at most once, so a chain of look-alikes never turns into
 * a pile of "duplicates" of each other.
 */
function flagDuplicates(rows) {
  const byCategory = new Map();
  for (const row of rows) {
    if (!row.active) continue;
    if (!byCategory.has(row.categoryId)) byCategory.set(row.categoryId, []);
    byCategory.get(row.categoryId).push(row);
  }

  for (const group of byCategory.values()) {
    // The keeper is the one with a rule behind it, then the one charged most
    // recently — the copy the student is still using.
    const pool = [...group].sort(
      (a, b) => Number(b.hasRule) - Number(a.hasRule) || a.daysSinceLastCharge - b.daysSinceLastCharge
    );
    const extras = new Set();

    for (let i = 0; i < pool.length; i += 1) {
      const keeper = pool[i];
      if (extras.has(keeper)) continue;
      for (let j = i + 1; j < pool.length; j += 1) {
        const other = pool[j];
        if (extras.has(other)) continue;
        if (!looksLikeTheSameThing(keeper, other)) continue;
        other.duplicateOf = keeper.key;
        other.duplicateOfTitle = keeper.title;
        extras.add(other);
        break;
      }
    }
  }
}

function looksLikeTheSameThing(a, b) {
  const gap = Math.abs(a.amount - b.amount);
  const within =
    gap <= Math.max(a.amount, b.amount) * (VAULT_RULES.duplicatePct / 100) || gap <= VAULT_RULES.duplicateFloor;
  if (!within) return false;

  // A word of four letters or more is a name, not a coincidence: "Netflix"
  // and "Netflix Premium" match, "Spotify" and "Apple Music" do not.
  return a.wordList.some((word) => word.length >= 4 && b.wordList.includes(word));
}

/**
 * The most useful verdict wins, so a subscription that is both unused and
 * price-rising is reported as unused (that is the money) and the rise stays
 * visible in the price line on the card.
 *  duplicate    — a second copy of something already being paid for
 *  idle         — a whole billing period with no charge (still committed)
 *  price-creep  — the same subscription, up by 10% or more since it started
 *  one-off      — repeats on a steady beat with no rule watching it
 *  in-use       — charged recently; nothing to say
 */
function judge(row) {
  row.verdict =
    row.duplicateOf !== null
      ? 'duplicate'
      : row.daysSinceLastCharge >= VAULT_RULES.idleDays
        ? 'idle'
        : row.growth.creep
          ? 'price-creep'
          : !row.hasRule
            ? 'one-off'
            : 'in-use';

  Object.assign(row, note(row));
  row.severity = severityOf(row);
}

function severityOf(row) {
  if (row.verdict === 'duplicate') return 'high';
  if (row.verdict === 'idle') return row.monthly >= 5 ? 'high' : 'medium';
  if (row.verdict === 'price-creep') return 'medium';
  return 'low';
}

/**
 * The plain sentence under each verdict. `note` is the English mirror for the
 * API and the notification; `noteKey`/`noteVars` are what the page renders,
 * so the sentence is translatable like every other string in the app. Vars are
 * numbers — the client formats the money ones in the student's own currency.
 */
function note(row) {
  if (row.verdict === 'duplicate') {
    const other = row.duplicateOfTitle || row.duplicateOf || '';
    return row.hasRule
      ? {
          noteKey: 'vault.noteDuplicate',
          noteVars: { other, monthly: row.monthly },
          note: `${other} is charged for the same thing, so cancelling this copy keeps ${money(row.monthly)} a month.`,
        }
      : {
          // No rule means no button: the money stops with the provider, not here.
          noteKey: 'vault.noteDuplicateNoRule',
          noteVars: { other, monthly: row.monthly },
          note: `${other} is charged for the same thing and no recurring entry tracks this copy — cancel it with the provider.`,
        };
  }

  if (row.verdict === 'idle') {
    return row.active
      ? {
          noteKey: 'vault.noteIdle',
          noteVars: { days: row.daysSinceLastCharge, monthly: row.monthly },
          note: `Nothing has been charged in ${row.daysSinceLastCharge} days, yet ${money(row.monthly)} a month is still set to come out.`,
        }
      : {
          noteKey: 'vault.noteIdlePaused',
          noteVars: { days: row.daysSinceLastCharge, monthly: row.monthly },
          note: `Nothing has been charged in ${row.daysSinceLastCharge} days and this entry is already paused — cancel it with the provider to stop the auto-renew.`,
        };
  }

  if (row.verdict === 'price-creep') {
    return {
      noteKey: 'vault.notePriceCreep',
      noteVars: { from: row.growth.from, to: row.growth.to, pct: row.growth.pct },
      note: `The same charge went from ${money(row.growth.from)} at the start to ${money(row.growth.to)} on your last one — ${row.growth.pct}% more.`,
    };
  }

  if (row.verdict === 'one-off') {
    return {
      noteKey: 'vault.noteOneOff',
      noteVars: { charges: row.charges12, monthly: row.monthly },
      note: `It repeats ${row.charges12} times a year but no recurring entry tracks it, so nothing is checking it for you.`,
    };
  }

  return {
    noteKey: 'vault.noteInUse',
    // No day count here on purpose: the card prints the exact figure just
    // above this sentence, and a one-day-old charge must not read "1 days".
    noteVars: {},
    note: 'Paid for and used — the charge keeps coming round, so there is nothing to do about this one.',
  };
}

const VERDICT_LABELS = {
  'in-use': 'In use',
  idle: 'Not used lately',
  'price-creep': 'Price went up',
  duplicate: 'Looks like a duplicate',
  'one-off': 'No rule behind it',
};

/** What the page and the API see. Internal working fields stay in the service. */
function publicRow(row) {
  return {
    key: row.key,
    // Empty is fine: the page falls back to t('rec.untitled').
    title: row.title,
    category: { id: row.categoryId, name: row.categoryName, icon: row.categoryIcon },
    amount: row.amount,
    frequency: row.frequency,
    monthly: row.monthly,
    annual: row.annual,
    lastCharge: row.lastCharge,
    daysSinceLastCharge: row.daysSinceLastCharge,
    active: row.active,
    verdict: row.verdict,
    verdictLabel: VERDICT_LABELS[row.verdict],
    severity: row.severity,
    note: row.note,
    noteKey: row.noteKey,
    noteVars: row.noteVars,
    // All the page needs to offer "Cancel this" — and nothing else may use them.
    ruleId: row.ruleId,
    hasRule: row.hasRule,
    duplicateOf: row.duplicateOf,
    duplicateOfTitle: row.duplicateOfTitle,
    charges: row.charges,
    charges12: row.charges12,
    averageGap: row.averageGap,
    growth: row.growth,
  };
}

function buildAlerts(detected) {
  return detected
    .filter((row) => row.verdict !== 'in-use')
    .map((row) => ({
      kind: row.verdict,
      severity: row.severity,
      title: row.title,
      detail: row.note,
      subscriptionKey: row.key,
      noteKey: row.noteKey,
      noteVars: row.noteVars,
      monthly: row.monthly,
    }));
}

const VERDICT_ORDER = ['duplicate', 'idle', 'price-creep', 'one-off', 'in-use'];

function verdictRank(verdict) {
  const at = VERDICT_ORDER.indexOf(verdict);
  return at === -1 ? VERDICT_ORDER.length : at;
}

/* ------------------------------ reminders text ----------------------------- */

function reminderMessage(sub) {
  const days = sub.daysSinceLastCharge;
  const detail = sub.active
    ? `nothing has been charged in ${days} days, yet ${money(sub.monthly)} a month is still set to come out. Cancel it from the subscription vault.`
    : `nothing has been charged in ${days} days and this entry is already paused. Cancel it with the provider to stop the auto-renew.`;
  return `${reminderTitle(sub)} — ${detail}`.slice(0, 400);
}

/**
 * The part of the reminder that identifies the subscription. It is the name
 * the student gave it, and scanAndRemind compares this — not the whole
 * sentence, which moves as the days since the last charge grow.
 */
function reminderTitle(sub) {
  return String(sub.title || '').trim().slice(0, 120) || 'Subscription';
}

function reminderStamp(message) {
  return String(message).split('—')[0].trim().toLowerCase();
}

/* --------------------------------- helpers --------------------------------- */

function sum(values) {
  let total = 0;
  for (const value of values) total += Number(value) || 0;
  return total;
}

function money(value) {
  return `$${formatMoney(value)}`;
}

/**
 * Lowercase letters and numbers, words separated by single spaces — the exact
 * shape the aggregation builds with $regexFindAll, so a rule can be matched
 * to a hand-typed charge pattern on both sides.
 */
function words(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(' ');
}

function daysBetween(date, today) {
  return Math.max(0, Math.round((today.getTime() - new Date(date).getTime()) / DAY));
}

function startOfDay(value) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}
