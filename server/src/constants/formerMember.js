/**
 * The name a group member row carries once its person has closed their account.
 *
 * THIS FILE IMPORTS NOTHING, and that is its entire design. It is not tidiness.
 *
 * `config/env.js` reads `process.env.MONGODB_URI` ONCE, when the module loads.
 * The test harness sets that variable at RUNTIME inside `startApp` and only then
 * dynamically imports `config/db.js`, so the whole test design depends on nothing
 * having loaded `env.js` before that moment. A single new static import that
 * reaches `env.js` breaks the ordering for every suite that pulls that module in:
 *
 *     services/groups.js -> services/accountDeletion.js -> services/accounts.js
 *                       -> config/env.js
 *
 * and the suite then connects to the default port, where nothing is listening.
 * Every test in it fails in under a millisecond, reporting a database error that
 * has nothing to do with what the test is about.
 *
 * A marker is vocabulary, not a service: two lines of comparison with no state, and
 * no reason for it to drag twenty models and a password module in behind it.
 */
export const FORMER_MEMBER_KEY = 'former-member';

/**
 * Is this group member row somebody who is gone?
 *
 * A comparison, and deliberately not a stored flag: a row written before account
 * deletion existed has no flag on it, and answering from what is actually stored is
 * right for that row as well as for one written afterwards.
 *
 * @param {{ name?: string } | null | undefined} member
 * @returns {boolean}
 */
export function isFormerMember(member) {
  return member?.name === FORMER_MEMBER_KEY;
}
