import Category from '../models/Category.js';
import TipTemplate from '../models/TipTemplate.js';
import { ensureRecoveryEmails } from './accounts.js';

/**
 * First-run bootstrap: the catalogue and starter wording every fresh
 * install (and every seed run) needs before the app makes sense.
 *
 * Everything here is an upsert keyed on a natural key — the category's
 * nameKey+type among defaults, the template's code — so calling it twice
 * (or ten times) inserts nothing extra and never clashes with wording an
 * administrator has since edited.
 */

/** CAT-1 (income) and CAT-2 (expense) — the shared default catalogue. */
const DEFAULT_CATEGORIES = [
  { name: 'Allowance', type: 'income', icon: 'wallet' },
  { name: 'Part-time Job', type: 'income', icon: 'briefcase' },
  { name: 'Scholarship', type: 'income', icon: 'award' },
  { name: 'Gift', type: 'income', icon: 'gift' },
  { name: 'Other Income', type: 'income', icon: 'plus-circle' },
  { name: 'Food', type: 'expense', icon: 'cup' },
  { name: 'Transport', type: 'expense', icon: 'bus' },
  { name: 'Hostel/Rent', type: 'expense', icon: 'house' },
  { name: 'Academics', type: 'expense', icon: 'book' },
  { name: 'Subscriptions', type: 'expense', icon: 'play' },
  { name: 'Entertainment', type: 'expense', icon: 'film' },
  { name: 'Miscellaneous', type: 'expense', icon: 'dots' },
];

/**
 * Starter wording for the tips engine (TIP-1). The placeholders match the
 * variables each rule in services/tips.js supplies, so a fresh database
 * shows friendly text immediately and administrators can reword it later.
 */
const STARTER_TEMPLATES = [
  {
    code: 'over_trend',
    title: '{{category}} is climbing',
    body: 'You are heading for about {{projected}} on {{category}} this month, while your usual is {{average}}. Holding it near {{cap}} a week would keep roughly {{saving}} with you.',
  },
  {
    code: 'budget_pace',
    title: 'Pace check on {{category}}',
    body: '{{pct}}% of your {{category}} budget is already gone with {{daysLeft}} days to go. About {{cap}} a week from here keeps you inside {{limit}}.',
  },
  {
    code: 'top_category',
    title: '{{category}} is the big one',
    body: 'At {{pct}}% of this month\'s spending, {{category}} leads the way. Shaving a tenth off it keeps about {{saving}} in your pocket.',
  },
  {
    code: 'subscriptions',
    title: 'A quick subscription check',
    body: 'Subscriptions come to {{total}} this month — {{pct}}% of your income. Dropping one you no longer use could free up about {{saving}}.',
  },
  {
    code: 'savings_gap',
    title: 'Your goal is close',
    body: 'You have put away {{saved}} of the {{goal}} you planned. {{gap}} more before month end puts you right back on track.',
  },
  {
    code: 'weekend_spike',
    title: 'Weekends run hotter',
    body: 'Weekends cost you {{weekendAvg}} a day against {{weekdayAvg}} on weekdays. Spreading the fun a little could keep about {{saving}}.',
  },
];

/**
 * Idempotent bootstrap: creates anything missing, leaves everything else
 * alone. Returns how many rows each catalogue holds when it finishes.
 */
export async function ensureDefaults() {
  for (const entry of DEFAULT_CATEGORIES) {
    await Category.updateOne(
      { user: null, isDefault: true, nameKey: entry.name.toLowerCase(), type: entry.type },
      {
        $setOnInsert: {
          user: null,
          isDefault: true,
          name: entry.name,
          nameKey: entry.name.toLowerCase(),
          type: entry.type,
          icon: entry.icon,
          isActive: true,
        },
      },
      { upsert: true }
    );
  }

  for (const entry of STARTER_TEMPLATES) {
    await TipTemplate.updateOne(
      { code: entry.code },
      { $setOnInsert: { code: entry.code, kind: 'tip', title: entry.title, bodyTemplate: entry.body, isActive: true } },
      { upsert: true }
    );
  }

  // Accounts from before the reset page asked for a recovery address: give them
  // their own sign-in address so nobody is locked out of the reset flow.
  const repaired = await ensureRecoveryEmails();

  return { categories: DEFAULT_CATEGORIES.length, templates: STARTER_TEMPLATES.length, recoveryEmails: repaired };
}
