/**
 * Demo data for the report, the video and the judges — run with `npm run seed`.
 *
 * Re-running is safe: accounts are looked up by email first, a student's
 * history is only written when they have none yet, budgets and starter rows
 * upsert on their natural keys, and indexes are built at the end so a fresh
 * database is query-ready before anyone logs in.
 *
 * Amounts are hand-tuned rather than random: they keep every figure inside
 * the plausible $2–$90 range, put Aisha's Food budget just past 80% in the
 * current month (amber warning in the demo) and give her last month one
 * clean "Food rose 30%" insight flag to show off.
 */
import { connectDb, disconnectDb } from '../config/db.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import Budget, { monthStart } from '../models/Budget.js';
import RecurringRule from '../models/RecurringRule.js';
import Announcement from '../models/Announcement.js';
import Insight from '../models/Insight.js';
import Notification from '../models/Notification.js';
import UserTip from '../models/UserTip.js';
import { hashPassword } from '../services/accounts.js';
import { ensureDefaults } from '../services/defaults.js';
import { generateInsight } from '../services/insight.js';
import { toDec } from '../utils/money.js';

/* ---------------------------------- accounts ----------------------------------- */

const ACCOUNTS = [
  { name: 'Campus Coordinator', email: 'admin@campuscoin.test', password: 'Admin@12345', role: 'admin' },
  { name: 'Aisha', email: 'aisha@campuscoin.test', password: 'Student@12345', role: 'student', academicYear: '1st year', allowance: '600', savingsGoal: '200' },
  { name: 'Bilal', email: 'bilal@campuscoin.test', password: 'Student@12345', role: 'student', academicYear: '3rd year', allowance: '750', savingsGoal: '300' },
  { name: 'New User', email: 'newuser@campuscoin.test', password: 'Student@12345', role: 'student' }, // deliberately empty: first-run flow
];

const CREDENTIAL_ROWS = [
  ['Role', 'Email', 'Password'],
  ['Administrator', 'admin@campuscoin.test', 'Admin@12345'],
  ['Student 1 — Aisha', 'aisha@campuscoin.test', 'Student@12345'],
  ['Student 2 — Bilal', 'bilal@campuscoin.test', 'Student@12345'],
  ['Student 3 — empty account', 'newuser@campuscoin.test', 'Student@12345'],
];

/* ------------------------------- month recipes --------------------------------- */
// Six months of history: index 0 is five months back, index 5 is the month
// we are in right now (entries after today are dropped).

const AISHA_GROCERY = [28, 28, 27, 30, 45, 18]; // August climbs, then the flag has a story to tell

const AISHA_MONTH = [
  { day: 1, type: 'income', cat: 'allowance', desc: 'Monthly allowance', amount: 600 },
  { day: 2, type: 'expense', cat: 'hostel/rent', desc: 'Hostel mess charges', amount: 85 },
  { day: 5, type: 'expense', cat: 'subscriptions', desc: 'Netflix', amount: 15 },
  { day: 7, type: 'expense', cat: 'food', desc: 'Campus cafe lunch', amount: 5.4, snap: 'weekday' },
  { day: 9, type: 'expense', cat: 'transport', desc: 'Bus pass top-up', amount: 15, snap: 'weekday' },
  { day: 12, type: 'expense', cat: 'food', desc: 'Grocery run', amount: (i) => AISHA_GROCERY[i], snap: 'weekday' },
  { day: 16, type: 'expense', cat: 'transport', desc: 'Uber ride', amount: 9.5 },
  { day: 18, type: 'expense', cat: 'food', desc: 'Chai at the stall', amount: 3.2 },
  { day: 20, type: 'expense', cat: 'entertainment', desc: 'Movie ticket', amount: 14, snap: 'weekend' },
  { day: 22, type: 'expense', cat: 'academics', desc: 'Printer xerox notes', amount: 4, snap: 'weekday' },
  { day: 24, type: 'expense', cat: 'miscellaneous', desc: 'Laundry', amount: 8, snap: 'weekday' },
  { day: 26, type: 'expense', cat: 'food', desc: 'Pizza with friends', amount: 18, snap: 'weekend' },
  { day: 26, type: 'expense', cat: 'subscriptions', desc: 'Spotify student', amount: 6 },
];

const BILAL_GROCERY = [24, 22, 25, 23, 30, 23];

const BILAL_MONTH = [
  { day: 1, type: 'income', cat: 'allowance', desc: 'Monthly allowance', amount: 750 },
  { day: 2, type: 'expense', cat: 'hostel/rent', desc: 'Apartment rent share', amount: 90 },
  { day: 5, type: 'expense', cat: 'subscriptions', desc: 'Netflix', amount: 15 },
  { day: 8, type: 'expense', cat: 'food', desc: 'Weekly grocery', amount: (i) => BILAL_GROCERY[i], snap: 'weekday' },
  { day: 10, type: 'expense', cat: 'transport', desc: 'Uber ride', amount: 9.5 },
  { day: 12, type: 'expense', cat: 'food', desc: 'Canteen lunch', amount: 6.5, snap: 'weekday' },
  { day: 14, type: 'income', cat: 'part-time job', desc: 'Tuition class pay', amount: 45 },
  {
    day: 15,
    type: 'expense',
    cat: 'academics',
    desc: (i) => (i % 2 === 0 ? 'Course textbook' : 'Lab printouts'),
    amount: (i) => (i % 2 === 0 ? 32 : 8),
    snap: 'weekday',
  },
  { day: 17, type: 'expense', cat: 'subscriptions', desc: 'Spotify student', amount: 6 },
  { day: 19, type: 'expense', cat: 'food', desc: 'Chai and biscuits', amount: 3.5 },
  { day: 21, type: 'expense', cat: 'entertainment', desc: 'Concert ticket', amount: 16, snap: 'weekend' },
  { day: 23, type: 'expense', cat: 'miscellaneous', desc: 'Laundry and haircut', amount: 9, snap: 'weekday' },
  { day: 25, type: 'expense', cat: 'transport', desc: 'Metro card top-up', amount: 14 },
  { day: 27, type: 'expense', cat: 'food', desc: 'Pizza night with friends', amount: 20, snap: 'weekend' },
];

/** Current-month budgets — Aisha's Food lands just under 90%: the amber bar. */
const BUDGET_LIMITS = {
  aisha: { food: 30, transport: 40, entertainment: 25, subscriptions: 20 },
  bilal: { food: 40, transport: 40, entertainment: 25, subscriptions: 20 },
};

/* ----------------------------------- main -------------------------------------- */

async function main() {
  await connectDb();
  console.log('Seeding Campus Coin...');

  const counts = await ensureDefaults();
  console.log(`  defaults ready: ${counts.categories} categories, ${counts.templates} tip templates`);

  const users = {};
  for (const spec of ACCOUNTS) {
    users[spec.email] = await findOrCreate(spec);
  }
  const admin = users['admin@campuscoin.test'].user;
  const aisha = users['aisha@campuscoin.test'].user;
  const bilal = users['bilal@campuscoin.test'].user;

  const categories = await defaultCategoriesByKey();

  let historyRows = 0;
  for (const [student, recipe] of [
    [aisha, AISHA_MONTH],
    [bilal, BILAL_MONTH],
  ]) {
    if (await Transaction.exists({ user: student._id })) {
      console.log(`  ${student.email} already has entries — leaving them untouched`);
      continue;
    }
    const docs = buildHistory(student, recipe, categories);
    if (docs.length > 0) await Transaction.insertMany(docs);
    historyRows += docs.length;
    console.log(`  ${student.email}: ${docs.length} entries across 6 months`);
  }

  await seedBudgets(aisha, categories);
  await seedBudgets(bilal, categories);
  await seedRecurringRules(aisha, bilal, categories);
  await seedAnnouncements(admin);
  await pregenerateInsight(aisha);

  // Every index declared in the schemas (unique keys included), so a fresh
  // database enforces its rules before the first real request.
  for (const model of [User, Category, Transaction, Budget, Notification, UserTip, Insight]) {
    await model.ensureIndexes();
  }

  console.log(`  history rows written: ${historyRows}`);
  printCredentials();
  console.log('Done.\n');
}

/* --------------------------------- accounts ------------------------------------ */

async function findOrCreate(spec) {
  const existing = await User.findOne({ email: spec.email });
  if (existing) {
    console.log(`  ${spec.email} already exists — reusing it`);
    return { user: existing, created: false };
  }

  const user = await User.create({
    name: spec.name,
    email: spec.email,
    passwordHash: await hashPassword(spec.password),
    role: spec.role,
    isActive: true,
    academicYear: spec.academicYear || '',
    monthlyAllowanceBaseline: spec.allowance ? toDec(spec.allowance) : null,
    monthlySavingsGoal: spec.savingsGoal ? toDec(spec.savingsGoal) : null,
  });
  console.log(`  created ${spec.email}`);
  return { user, created: true };
}

/* --------------------------------- history ------------------------------------- */

async function defaultCategoriesByKey() {
  const rows = await Category.find({ user: null, isDefault: true, isActive: true });
  return new Map(rows.map((c) => [c.nameKey, c]));
}

/**
 * Turn a month recipe into insertable documents. Dates sit at noon UTC so
 * monthly grouping never pushes an entry into the neighbouring month, the
 * current month stops at today, and outings/chores land on the weekday or
 * weekend they would really happen on.
 */
function buildHistory(student, recipe, categories) {
  const now = new Date();
  const currentStart = monthStart(now);
  const todayNoon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  const docs = [];

  for (let i = 5; i >= 0; i -= 1) {
    const index = 5 - i; // 0 = oldest month … 5 = current month
    const start = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - i, 1));
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cutoff = index === 5 ? todayNoon : Date.UTC(year, month, daysInMonth, 12);

    for (const entry of recipe) {
      const day = Math.min(entry.day, daysInMonth);
      const base = Date.UTC(year, month, day, 12);
      const date = entry.snap ? snapWithin(base, entry.snap, cutoff) : base <= cutoff ? new Date(base) : null;
      if (!date) continue; // falls after today, or snapping could not help

      const category = categories.get(entry.cat);
      if (!category) throw new Error(`Missing default category "${entry.cat}" — run ensureDefaults first.`);

      docs.push({
        user: student._id,
        category: category._id,
        amount: toDec(typeof entry.amount === 'function' ? entry.amount(index) : entry.amount),
        type: entry.type,
        description: String(typeof entry.desc === 'function' ? entry.desc(index) : entry.desc).slice(0, 255),
        date,
        isDeleted: false,
      });
    }
  }
  return docs;
}

/** Nearest date on the wanted kind of day, same month, never after the cutoff. */
function snapWithin(base, want, cutoff) {
  const date = new Date(base);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day0 = date.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const matches = (dow) => (want === 'weekend' ? dow === 0 || dow === 6 : dow >= 1 && dow <= 5);

  for (let shift = 0; shift <= 6; shift += 1) {
    for (const day of [day0 + shift, day0 - shift]) {
      if (day < 1 || day > daysInMonth) continue;
      const candidate = new Date(Date.UTC(year, month, day, 12));
      if (candidate.getTime() > cutoff) continue;
      if (matches(candidate.getUTCDay())) return candidate;
    }
  }
  return null;
}

/* --------------------------------- budgets ------------------------------------- */

async function seedBudgets(student, categories) {
  const limits = student.email.startsWith('aisha') ? BUDGET_LIMITS.aisha : BUDGET_LIMITS.bilal;
  const month = monthStart(new Date());

  for (const [nameKey, limit] of Object.entries(limits)) {
    const category = categories.get(nameKey);
    if (!category) continue;
    await Budget.updateOne(
      { user: student._id, category: category._id, month },
      { $setOnInsert: { user: student._id, category: category._id, month, limitAmount: toDec(limit) } },
      { upsert: true }
    );
  }
}

/* -------------------------------- recurring ------------------------------------ */

async function seedRecurringRules(aisha, bilal, categories) {
  const now = new Date();
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const fifthOfNext = new Date(Date.UTC(nextMonthStart.getUTCFullYear(), nextMonthStart.getUTCMonth(), 5, 12));

  const rules = [
    {
      user: aisha,
      cat: 'allowance',
      type: 'income',
      amount: 600,
      desc: 'Monthly allowance',
      frequency: 'monthly',
      dayOfPeriod: 1,
      startDate: nextMonthStart,
    },
    {
      user: aisha,
      cat: 'transport',
      type: 'expense',
      amount: 10,
      desc: 'Campus bus fare',
      frequency: 'weekly',
      dayOfPeriod: 1,
      startDate: nextWeekday(1), // starts next Monday: history is already seeded by hand
    },
    {
      user: bilal,
      cat: 'subscriptions',
      type: 'expense',
      amount: 15,
      desc: 'Netflix',
      frequency: 'monthly',
      dayOfPeriod: 5,
      startDate: fifthOfNext,
    },
  ];

  let created = 0;
  for (const rule of rules) {
    if (await RecurringRule.exists({ user: rule.user._id, description: rule.desc, frequency: rule.frequency })) continue;
    const category = categories.get(rule.cat);
    if (!category) continue;

    await RecurringRule.create({
      user: rule.user._id,
      category: category._id,
      type: rule.type,
      amount: toDec(rule.amount),
      description: rule.desc,
      frequency: rule.frequency,
      dayOfPeriod: rule.dayOfPeriod,
      startDate: rule.startDate,
      endDate: null,
      lastGeneratedOn: null,
      isActive: true,
    });
    created += 1;
  }
  console.log(`  recurring rules: ${created} added`);
}

/** The next occurrence of a weekday (0 = Sunday) strictly after today. */
function nextWeekday(dow) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  let delta = (dow - new Date(base).getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return new Date(base + delta * 24 * 60 * 60 * 1000);
}

/* ------------------------------- announcements --------------------------------- */

async function seedAnnouncements(admin) {
  if (await Announcement.exists({})) {
    console.log('  announcements already present — skipping');
    return;
  }

  const now = Date.now();
  await Announcement.create([
    {
      title: 'Welcome to a new term',
      body: 'Log your allowance the day it arrives and your budgets get off to a clean start. Each entry takes about ten seconds.',
      startsAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      endsAt: null,
      isActive: true,
      createdBy: admin._id,
    },
    {
      title: 'Budget check-in week',
      body: 'Set your Food and Transport limits before Friday. You will get one friendly nudge as you near each limit — never a second one.',
      startsAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      endsAt: null,
      isActive: true,
      createdBy: admin._id,
    },
  ]);
  console.log('  announcements: 2 posted');
}

/* --------------------------------- insight ------------------------------------- */

async function pregenerateInsight(aisha) {
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  if (await Insight.exists({ user: aisha._id, month: lastMonth })) {
    console.log('  insight for last month already exists — skipping');
    return;
  }

  const insight = await generateInsight(aisha, lastMonth);
  console.log(`  insight generated for ${insight.month.toISOString().slice(0, 10)} (${insight.source})`);
}

/* ---------------------------------- output ------------------------------------- */

function printCredentials() {
  const widths = CREDENTIAL_ROWS[0].map((_, col) => Math.max(...CREDENTIAL_ROWS.map((row) => row[col].length)));
  const line = (row) => `| ${row.map((cell, col) => cell.padEnd(widths[col])).join(' | ')} |`;
  const divider = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;

  console.log('\nDemo credentials');
  console.log(line(CREDENTIAL_ROWS[0]));
  console.log(divider);
  for (const row of CREDENTIAL_ROWS.slice(1)) console.log(line(row));
}

/* ----------------------------------- boot -------------------------------------- */

/** Seeds whatever database MONGODB_URI points at; safe to re-run. */
export async function runSeed() {
  await main();
}

// When executed directly (`npm run seed`) we own the whole process, so we
// connect first and exit when done. Imported by another script (dev-local),
// the caller already owns the connection and the lifecycle.
const isDirectRun = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;

if (isDirectRun) {
  main()
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('\nSeed failed:', err);
      try {
        await disconnectDb();
      } catch {
        // nothing left to do — the process is exiting anyway
      }
      process.exit(1);
    });
}
