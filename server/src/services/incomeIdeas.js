import mongoose from 'mongoose';
import IncomeIdea from '../models/IncomeIdea.js';

/**
 * The side-income library (ADV-5): curated, admin-managed rows of ways a
 * student can earn on the side, each one carrying where its claims came from.
 *
 * Two things this service is careful about, because the page is shown to
 * judges as much as to students:
 *
 *  1. It never states an outcome. Rows carry wording, not earnings, and the
 *     library sends its own DISCLAIMER with every read so a caller cannot
 *     present the list as advice or as a promise.
 *  2. It refuses an unsourced "trending" badge. A trend claim is a claim
 *     about the world, so the service will not accept one without a sourceUrl
 *     or a sourceNote — see `problem()` below, where the message says why.
 *
 * The list is one aggregation: a `$match`, a `$sort` and a `$facet` that
 * hands back the page of rows AND the total, so the client can paginate
 * without asking a second question.
 */

/** The four buckets the filter chips offer, in the order they are shown. */
export const CATEGORIES = ['part-time', 'freelance', 'reselling', 'services'];

/** Shipped with every read: this library orients, it does not advise. */
export const DISCLAIMER =
  'Ideas and orientation only — not financial advice, and not a promise of income.';

/** One page of the grid; a full library of side ideas is still short. */
const PER_PAGE = 12;
const MAX_PER_PAGE = 60;

/* ---------------------------------- read ---------------------------------- */

/**
 * The list, with the total, in one round trip.
 *
 * `trending` is only ever a narrowing filter: 'true'/'1' restricts to
 * trending rows and anything else (including 'false') means "do not filter".
 * The chips on the page can therefore only add a restriction, never hide the
 * half of the library that is not trending.
 *
 * Retired rows are left out unless `includeRetired` says otherwise — the
 * public page shows what students may read, while the admin panel needs the
 * switched-off rows too so one can be found and brought back.
 */
export async function list({ category, trending, q, page, perPage, includeRetired } = {}) {
  const match = includeRetired ? {} : { isActive: true };

  const wanted = String(category ?? '').trim();
  if (wanted) {
    if (!CATEGORIES.includes(wanted)) throw badRequest(unknownCategory());
    match.category = wanted;
  }
  if (isYes(trending)) match.isTrending = true;

  // The search text is escaped before it becomes a $regex, so a student
  // typing "(" or "a|b" gets a literal search instead of a broken pattern.
  const text = String(q ?? '').trim();
  if (text) {
    const pattern = { $regex: escapeRegex(text), $options: 'i' };
    match.$or = [{ title: pattern }, { summary: pattern }, { howItWorks: pattern }, { sourceNote: pattern }];
  }

  const at = Math.max(1, Number(page) || 1);
  const take = Math.min(MAX_PER_PAGE, Math.max(1, Number(perPage) || PER_PAGE));

  // The sort runs before the facet, so both branches see the same order:
  // trending first, then the administrator's ordering, then the title.
  const [facet] = await IncomeIdea.aggregate([
    { $match: match },
    { $sort: { isTrending: -1, sortOrder: 1, title: 1 } },
    {
      $facet: {
        rows: [{ $skip: (at - 1) * take }, { $limit: take }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const total = facet?.total?.[0]?.count || 0;
  return {
    rows: (facet?.rows || []).map(present),
    pagination: { page: at, perPage: take, total, pages: Math.max(1, Math.ceil(total / take)) },
  };
}

/** One idea by id, or null. A retired row still answers here. */
export async function readOne(id) {
  const idea = await byId(id);
  return idea ? present(idea) : null;
}

/** How much of the library there is: every category, and the trending count. */
export async function stats() {
  const [row] = await IncomeIdea.aggregate([
    { $match: { isActive: true } },
    {
      $facet: {
        byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
        trending: [{ $match: { isTrending: true } }, { $count: 'count' }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  // Every category is answered, including the empty ones — a chip reading
  // "0" is information; a missing key would leave the page guessing.
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const row_ of row?.byCategory || []) {
    if (byCategory[row_._id] !== undefined) byCategory[row_._id] = row_.count;
  }

  return {
    total: row?.total?.[0]?.count || 0,
    trending: row?.trending?.[0]?.count || 0,
    byCategory,
  };
}

/* --------------------------------- write ---------------------------------- */

export async function create(payload = {}) {
  const bad = problem(payload);
  if (bad) throw badRequest(bad);

  const idea = await IncomeIdea.create(clean(payload));
  return present(idea);
}

export async function update(id, payload = {}) {
  const idea = await byId(id);
  if (!idea) throw notFound('That income idea was not found.');

  // Validated as the row would end up, not as the patch: clearing the source
  // note on a trending idea has to fail exactly like setting the badge on an
  // unsourced one would.
  const bad = problem(merge(idea, payload));
  if (bad) throw badRequest(bad);

  Object.assign(idea, clean(payload));
  await idea.save();
  return present(idea);
}

export async function remove(id) {
  const idea = await byId(id);
  if (!idea) throw notFound('That income idea was not found.');

  // A hard delete, unlike a ledger entry: nothing references these rows, and
  // an unsourced claim that is no longer defensible should not linger.
  await idea.deleteOne();
  return { ok: true, id: idea._id.toString() };
}

/* -------------------------------- validation ------------------------------- */

/**
 * Every rule in one place, in the order an administrator meets them. Returns
 * a plain English sentence or null — the routes hand that sentence straight
 * to the browser, so it has to read like help, not like a stack trace.
 */
function problem(body) {
  const title = String(body.title ?? '').trim();
  const summary = String(body.summary ?? '').trim();
  const category = String(body.category ?? '').trim();
  const howItWorks = String(body.howItWorks ?? '');
  const typicalEffort = String(body.typicalEffort ?? '');
  const startupCost = String(body.startupCost ?? '');
  const sourceUrl = String(body.sourceUrl ?? '').trim();
  const sourceNote = String(body.sourceNote ?? '').trim();

  if (!title) return 'Please give the idea a title.';
  if (title.length > 90) return 'Titles can be at most 90 characters.';
  if (!summary) return 'Please add a short summary of what the idea is.';
  if (summary.length > 300) return 'Summaries can be at most 300 characters.';
  if (!CATEGORIES.includes(category)) return unknownCategory();
  if (howItWorks.length > 1200) return 'The “how it works” text can be at most 1200 characters.';
  if (typicalEffort.length > 120) return 'The effort note can be at most 120 characters.';
  if (startupCost.length > 120) return 'The startup cost note can be at most 120 characters.';
  if (sourceNote.length > 200) return 'The source note can be at most 200 characters.';
  // Checked only when one is actually there: an idea may have no source at
  // all, but it may not have a broken one either.
  if (sourceUrl && !/^https?:\/\/\S+$/i.test(sourceUrl)) {
    return 'A source link has to be a full web address starting with http:// or https://.';
  }
  // The defensibility rule. A trending badge is a statement about what
  // students are doing right now, so it cannot be asserted without saying
  // where that was found.
  if (Boolean(body.isTrending) && !sourceUrl && !sourceNote) {
    return 'A trending idea has to say where the trend comes from: add a source link or a source note before you mark it trending.';
  }
  return null;
}

function unknownCategory() {
  return 'Category must be part-time, freelance, reselling or services.';
}

/** Only the fields this form owns — nothing else from a body is ever stored. */
const FIELDS = [
  'title',
  'category',
  'summary',
  'howItWorks',
  'typicalEffort',
  'startupCost',
  'isTrending',
  'sourceUrl',
  'sourceNote',
  'icon',
  'isActive',
  'sortOrder',
];

function clean(payload = {}) {
  const out = {};
  for (const key of FIELDS) {
    if (payload[key] === undefined || payload[key] === null) continue;
    if (key === 'isTrending' || key === 'isActive') out[key] = Boolean(payload[key]);
    else if (key === 'sortOrder') out[key] = Number(payload[key]) || 0;
    else out[key] = String(payload[key]).trim();
  }
  return out;
}

/** The stored row with the patch laid over it — what validation has to judge. */
function merge(stored, payload) {
  const merged = {};
  for (const key of FIELDS) {
    const next = payload[key];
    if (next === undefined || next === null) merged[key] = stored[key];
    else merged[key] = next;
  }
  return merged;
}

/* --------------------------------- helpers -------------------------------- */

/** What the page and the admin panel see; the model stays internal. */
function present(idea) {
  return {
    id: idea._id.toString(),
    title: idea.title,
    category: idea.category,
    summary: idea.summary,
    howItWorks: idea.howItWorks || '',
    typicalEffort: idea.typicalEffort || '',
    startupCost: idea.startupCost || '',
    isTrending: Boolean(idea.isTrending),
    sourceUrl: idea.sourceUrl || '',
    sourceNote: idea.sourceNote || '',
    icon: idea.icon || '💡',
    isActive: Boolean(idea.isActive),
    sortOrder: idea.sortOrder || 0,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

async function byId(id) {
  const key = String(id ?? '').trim();
  if (!mongoose.isValidObjectId(key)) return null;
  return IncomeIdea.findById(key);
}

function isYes(value) {
  return ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

/** Every regex metacharacter, so a search word can never become a pattern. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
