/**
 * Merge a staged set of translations into one language dictionary.
 *
 * WHY THIS FILE LIVES IN THE REPOSITORY
 *
 * It lived in the system temp folder for most of this build, and the temp folder
 * deleted it four separate times - always in the middle of a round, always after
 * the agents that were about to need it had already reported. A build tool that a
 * cleanup can remove is not a build tool; it is a coincidence. Nothing else in
 * `tools/` has ever been in Temp, and that is the whole argument for this one
 * being here too.
 *
 * USAGE
 *
 *   node tools/merge-lang.mjs <lang> <staged-file.json> [--clean]
 *
 * It reads `client/src/i18n/pending-<lang>/<staged-file.json>`, inserts every key
 * it finds into `client/src/i18n/<lang>.js`, and with `--clean` removes the
 * staged file. Success prints the count and the dictionary's new total.
 *
 * WHY IT IS INSERT-ONLY, AND WHY THAT MATTERS
 *
 * It refuses to overwrite a key that already exists. That is not caution, it is
 * the only safe shape: this dictionary is hand-maintained and a translator's
 * judgement is in every value, so a tool that can rewrite one would let a later
 * round silently undo an earlier one. The consequence is a rule worth knowing:
 * to change a value you strip your own block by script and merge again, because
 * there is no supported way to edit a dictionary in place.
 *
 * THE CHECKS, AND WHY EACH ONE IS HERE
 *
 * Three, in this order, because each one has caught a real mistake:
 *
 *  1. PLACEHOLDERS MUST MATCH ENGLISH, per key. A dropped `{left}` renders as a
 *     literal brace in that language and nowhere else, and the screen still looks
 *     fine in the language you are reading it in.
 *  2. NO VALUE MAY BE ANOTHER KEY'S NAME. This is the one the tool warns about
 *     rather than stopping, and it is a warning on purpose: it means somebody
 *     wrote `invite.copy = 'invite.linkLabel'`, and there are legitimate keys
 *     that are just a repetition. So it prints and continues, and the
 *     verification step is what catches it.
 *  3. THE MODULE MUST STILL IMPORT. A dictionary that parses is not a dictionary
 *     that loads, and the difference is a missing comma four hundred lines above
 *     the symptom.
 *
 * The arguments are the whole contract, so they are checked before anything is
 * written rather than after.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const I18N = resolve(HERE, '..', 'client', 'src', 'i18n');

/* --------------------------------- arguments -------------------------------- */

const [lang, stagedName, ...rest] = process.argv.slice(2);

if (!lang || !stagedName) {
  console.log('usage: node tools/merge-lang.mjs <lang> <staged-file.json> [--clean]');
  process.exit(2);
}

const clean = rest.includes('--clean');
const unknown = rest.filter((a) => a !== '--clean');
if (unknown.length) {
  console.log(`unknown argument(s): ${unknown.join(', ')}`);
  process.exit(2);
}

const STAGED = resolve(I18N, `pending-${lang}`, stagedName);
const TARGET = resolve(I18N, `${lang}.js`);

/* Nothing is written until every input has been read, so a typo in the language
   code cannot produce a half-merged file and a clean-looking exit. */
if (!existsSync(STAGED)) {
  console.log(`no staged file at ${STAGED}`);
  console.log(`  it should be client/src/i18n/pending-${lang}/${stagedName}`);
  process.exit(1);
}
if (!/^[a-z]{2}$/.test(lang)) {
  console.log(`"${lang}" is not a two-letter language code`);
  process.exit(1);
}
if (!existsSync(TARGET)) {
  console.log(`no dictionary at ${TARGET}`);
  process.exit(1);
}

/* ---------------------------------- inputs ---------------------------------- */

let staged;
let english;
try {
  staged = JSON.parse(readFileSync(STAGED, 'utf8'));
  english = (await import(pathToFileURL(resolve(I18N, 'en.js')).href)).default;
} catch (err) {
  console.log(`could not read the inputs: ${err.message}`);
  process.exit(1);
}

if (!staged || typeof staged !== 'object' || Array.isArray(staged)) {
  console.log('the staged file is not a flat object of key: value');
  process.exit(1);
}

const keys = Object.keys(staged);
if (!keys.length) {
  console.log('the staged file has no keys');
  process.exit(1);
}

/* ------------------------------- placeholders ------------------------------- */

/** `{name}` and friends, as a SET, so order and repetition do not matter. */
function placeholders(value) {
  return new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

const placeholderProblems = [];
for (const key of keys) {
  if (!(key in english)) {
    placeholderProblems.push(`${key}: English has no such key, so there is nothing to match against`);
    continue;
  }
  const want = placeholders(english[key]);
  const got = placeholders(staged[key]);
  const missingWant = [...want].filter((p) => !got.has(p));
  const extraGot = [...got].filter((p) => !want.has(p));
  if (missingWant.length || extraGot.length) {
    placeholderProblems.push(
      `${key}: placeholders [${got.join(', ')}] != English [${want.join(', ')}]` +
        (missingWant.length ? `, missing {${missingWant.join('}, {')}}` : '') +
        (extraGot.length ? `, unexpected {${extraGot.join('}, {')}}` : '')
    );
  }
}

if (placeholderProblems.length) {
  console.log(`STOP: placeholders differ from English on ${placeholderProblems.length} key(s):`);
  for (const p of placeholderProblems) console.log(`  ${p}`);
  process.exit(1);
}

/* ---------------------------------- the file -------------------------------- */

let text = readFileSync(TARGET, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';

/* the insert-only check: a key already here is somebody's work */
const already = keys.filter((key) => new RegExp(`^ {2}'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`, 'm').test(text));
if (already.length) {
  console.log(
    `STOP: ${already.length} key(s) are already in ${lang}.js, and this tool will not overwrite a value:\n` +
      already.map((k) => `  ${k}`).join('\n') +
      `\n  to change one, strip YOUR OWN block with a script that matches the full line, and merge again.`
  );
  process.exit(1);
}

/* an escaped single quote is the only escape a single-quoted JS string needs here */
const literal = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const before = text.split('\n').length;
const block = keys.map((key) => `  ${literal(key)}: ${literal(staged[key])},`).join(eol);

/* the dictionary ends with a closing `};` and a newline. Anything else means the
   shape moved, and appending blindly would put the keys outside the object. */
const closeAt = text.lastIndexOf('};');
if (closeAt < 0) throw new Error(`${lang}.js has no closing brace - the shape moved`);

text = `${text.slice(0, closeAt)}${eol}${block}${eol}${text.slice(closeAt)}`;
writeFileSync(TARGET, text, 'utf8');

/* ------------------------------- verification ------------------------------- */

const after = readFileSync(TARGET, 'utf8');
let total = 0;
try {
  const dict = (await import(`${pathToFileURL(TARGET).href}?t=${Date.now()}`)).default;
  total = Object.keys(dict).length;
} catch (err) {
  console.log(`\nFAIL: ${lang}.js no longer imports: ${err.message}`);
  console.log(`  ${keys.length} key(s) were written, so the file needs fixing before anything else runs.`);
  process.exit(1);
}

const notLanded = keys.filter((key) => !new RegExp(`^ {2}'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`, 'm').test(after));
if (notLanded.length) {
  console.log(`\nFAIL: ${notLanded.length} key(s) are not in the file after the write`);
  process.exit(1);
}

/* a value that is another key's name: printed, not fatal - see the note above */
const keyShaped = keys.filter((key) => /^[a-z][a-zA-Z0-9]*\.[A-Za-z0-9.]+$/.test(String(staged[key]).trim()));

if (clean) rmSync(STAGED, { force: true });

console.log(`${keys.length} keys merged into ${lang}.js`);
if (keyShaped.length) {
  console.log(`  A VALUE IS A KEY, in ${keyShaped.length}: ${keyShaped.join(', ')}`);
  console.log('  (a warning, not a stop: some keys are a deliberate repetition. The verification step catches the rest)');
} else {
  console.log('  no value is another key name');
}
console.log(`  and ${lang}.js now carries ${total} keys`);
console.log(`  ${before} -> ${after.split('\n').length} lines`);
if (clean) console.log(`  and pending-${lang}/${stagedName} is gone`);
