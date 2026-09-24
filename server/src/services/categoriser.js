import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import CategoryCorrection from '../models/CategoryCorrection.js';

/**
 * The category suggestion assistant (PRD §3.5, architecture §6.3).
 *
 * While a description is being typed we offer one guess, shown in the
 * interface as "Suggested" — never applied for the person, who stays free
 * to pick anything else. Two sources are checked in order:
 *
 *   1. History — this person's own past entries plus their stored
 *      corrections, scored per category whenever their words overlap the
 *      text being typed. Each matching entry adds a point, each correction
 *      adds its stored count, and confidence is the winner's share of all
 *      points: a naive-Bayes style ratio kept simple enough to explain in
 *      one sentence if anyone asks.
 *   2. Keywords — a small dictionary that points everyday words at the
 *      default categories, so a student on day one still gets a guess.
 *
 * Below 0.4 confidence we stay quiet rather than guess wildly.
 */

const MIN_CONFIDENCE = 0.4;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'my', 'was', 'paid', 'bought',
]);

/** Everyday words and where they point — keys are default category nameKeys. */
const KEYWORDS = {
  food: ['cafe', 'canteen', 'lunch', 'dinner', 'breakfast', 'pizza', 'kfc', 'burger', 'foodpanda', 'grocery', 'groceries', 'chai', 'coffee'],
  transport: ['uber', 'careem', 'bus', 'metro', 'fuel', 'petrol', 'rickshaw', 'ticket'],
  subscriptions: ['netflix', 'spotify', 'youtube', 'subscription', 'prime', 'app store'],
  entertainment: ['movie', 'movies', 'cinema', 'concert', 'game', 'outing'],
  academics: ['book', 'books', 'stationery', 'tuition', 'course', 'printer', 'xerox'],
  'hostel/rent': ['rent', 'hostel', 'mess'],
  allowance: ['allowance', 'salary', 'stipend'],
  scholarship: ['scholarship'],
  gift: ['gift'],
  'part-time job': ['wage', 'wages', 'freelance', 'tutoring'],
};

/* --------------------------------- entry points -------------------------------- */

/**
 * Suggest a category for a typed description.
 * Returns {categoryId, name, confidence, source} or null when nothing is
 * confident enough to show.
 */
export async function suggest(user, description) {
  const text = String(description || '').trim();
  if (text.length < 3) return null;

  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  const fromHistory = await historySuggestion(user, tokens);
  if (fromHistory) return fromHistory;

  return keywordSuggestion(text, tokens);
}

/**
 * Remember a manual choice (PRD §3.5): every meaningful word of the description
 * gets a vote for the category the person actually picked, so the next
 * "chai" they type moves towards the category they used last time.
 * Returns how many words were stored.
 */
export async function learnFromCorrection(user, description, chosenCategoryId) {
  if (!chosenCategoryId || !mongoose.isValidObjectId(chosenCategoryId)) return 0;

  const words = tokenize(description)
    .filter((word) => word.length >= 3)
    .slice(0, 12); // one tidy row per word; a rambling description stops at 12

  for (const word of words) {
    await CategoryCorrection.updateOne(
      { user: user._id, token: word, category: chosenCategoryId },
      { $inc: { count: 1 } },
      { upsert: true }
    );
  }
  return words.length;
}

/** Lower-case, punctuation and digits stripped, stopwords removed. */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\d_]+/g, ' ') // prices and codes never say what the item was
    .replace(/[^\p{L}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/* ---------------------------------- step 1 ------------------------------------- */

async function historySuggestion(user, tokens) {
  const pattern = new RegExp(`\\b(${tokens.map(escapeRegExp).join('|')})\\b`, 'i');

  const [entries, corrections] = await Promise.all([
    Transaction.aggregate([
      { $match: { user: user._id, isDeleted: false, description: pattern } },
      { $group: { _id: '$category', hits: { $sum: 1 } } },
    ]),
    CategoryCorrection.find({ user: user._id, token: { $in: tokens } }),
  ]);

  const scores = new Map();
  const add = (id, points) => {
    const key = String(id);
    scores.set(key, (scores.get(key) || 0) + points);
  };
  for (const row of entries) add(row._id, 1);
  for (const row of corrections) add(row.category, row.count);

  let total = 0;
  for (const points of scores.values()) total += points;
  if (total === 0) return null;

  const [winnerId, winnerScore] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  const confidence = round2(winnerScore / total);
  if (confidence < MIN_CONFIDENCE) return null;

  // A category the person has since retired is not worth proposing again.
  const category = await Category.findOne({ _id: winnerId, isActive: true });
  if (!category) return null;

  return {
    categoryId: category._id.toString(),
    name: category.name,
    confidence,
    source: 'history',
  };
}

/* ---------------------------------- step 2 ------------------------------------- */

async function keywordSuggestion(text, tokens) {
  const lower = text.toLowerCase();
  const scores = new Map();

  for (const [nameKey, words] of Object.entries(KEYWORDS)) {
    let points = 0;
    for (const word of words) {
      if (word.includes(' ')) {
        // Two-word keys like "app store" only make sense in the full phrase.
        if (new RegExp(`\\b${escapeRegExp(word)}\\b`).test(lower)) points += word.split(' ').length;
      } else if (tokens.includes(word)) {
        points += 1;
      }
    }
    if (points > 0) scores.set(nameKey, points);
  }

  if (scores.size === 0) return null;

  const [winnerKey, winnerPoints] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  // Confidence here is "how much of what was typed points at this category",
  // so one lucky word inside a long description stays a weak guess.
  const confidence = round2(winnerPoints / tokens.length);
  if (confidence < MIN_CONFIDENCE) return null;

  // A default renamed or retired by an administrator simply suggests nothing.
  const category = await Category.findOne({ user: null, isDefault: true, isActive: true, nameKey: winnerKey });
  if (!category) return null;

  return { categoryId: category._id.toString(), name: category.name, confidence, source: 'keywords' };
}

/* ---------------------------------- helpers ------------------------------------ */

function round2(n) {
  return Math.round(n * 100) / 100;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
