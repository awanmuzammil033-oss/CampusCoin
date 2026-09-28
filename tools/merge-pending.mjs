/**
 * Fold a pending English source into en.js.
 *
 * This file has been written twice now because a concurrent job keeps clearing
 * the temp folder, so this one lives in the repository instead - it is a tool the
 * project needs, not a scratch file.
 *
 * Three things it has to get right:
 *
 *  1. ESCAPING. en.js is a single-quoted object literal and a sentence about
 *     somebody's savings contains an apostrophe. Written raw it closes the string
 *     early and the whole module fails to parse - which takes down all fourteen
 *     languages, not just English. The module is imported afterwards to prove it
 *     parses rather than assumed to.
 *  2. NO BLIND OVERWRITE. If a key is already in en.js the script stops and
 *     prints it. Silently replacing one is how a screen that was working starts
 *     showing a stranger's sentence and the diff looks like an improvement.
 *  3. THE LINE ENDINGS. A script that does not know whether the file is CRLF or LF
 *     reports every anchor as "moved" on a Windows checkout, and a check that
 *     cries wolf gets ignored.
 *
 * usage: node tools/merge-pending.mjs <pending.json> [header comment]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const I18N = 'D:/CampusCoin/client/src/i18n';
const EN = `${I18N}/en.js`;

const source = process.argv[2];
const header = process.argv[3] || 'New keys';
if (!source) {
  console.error('usage: node tools/merge-pending.mjs <pending.json> [header comment]');
  process.exit(1);
}

let text = readFileSync(EN, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const pending = JSON.parse(readFileSync(`${I18N}/pending/${source}`, 'utf8'));

const already = Object.keys(pending).filter((key) => text.includes(`'${key}':`));
if (already.length) {
  console.error(`STOP: ${already.length} key(s) are already in en.js:`);
  for (const key of already.slice(0, 10)) console.error(`  ${key}`);
  process.exit(1);
}

/** Single-quoted for this file, with the two characters that can break out escaped. */
const asLiteral = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/* the header comment, wrapped, because a 190-character comment line in a file
   where every other comment is wrapped by hand is the one place a reader snags */
const wrapComment = (text_) => {
  const words = String(text_).split(/\s+/);
  const lines = [];
  let line = '  /*';
  for (const word of words) {
    if (line.length + word.length + 1 > 96) {
      lines.push(line);
      line = '     ';
    }
    line += ` ${word}`;
  }
  lines.push(`${line} */`);
  return lines.join(eol);
};

const block = [
  wrapComment(header),
  ...Object.entries(pending).map(([key, value]) => `  '${key}': ${asLiteral(value)},`),
].join(eol);

/* work on the body alone and put the tail back, so the arithmetic is the same
   whether the file ends `};` or `};\n` */
const tailMatch = text.match(/(\s*\};)(\s*)$/);
if (!tailMatch) {
  console.error(`STOP: en.js does not close the way this script expects (${JSON.stringify(text.slice(-10))})`);
  process.exit(1);
}
const tail = `${tailMatch[1]}${tailMatch[2]}`;
const body = text.slice(0, text.length - tailMatch[0].length).replace(/,?\s*$/, '');

writeFileSync(EN, `${body},${eol}${eol}${block}${tail}`, 'utf8');

const dict = (await import(`${pathToFileURL(EN).href}?v=${Date.now()}`)).default;
const missing = Object.keys(pending).filter((key) => !(key in dict));
const wrong = Object.entries(pending).filter(([key, value]) => dict[key] !== value);
const longLine = text.length && readFileSync(EN, 'utf8').split(eol).filter((l) => l.trimStart().startsWith('/*')).find((l) => l.length > 100);

console.log(
  [
    missing.length === 0 ? `all ${Object.keys(pending).length} keys are in en.js` : `MISSING: ${missing.join(', ')}`,
    wrong.length === 0 ? 'and every value is exactly what the pending file said' : `WRONG: ${wrong.map(([k]) => k).join(', ')}`,
    `en.js now carries ${Object.keys(dict).length} keys`,
    longLine ? `WARNING: a comment line is ${longLine.length} characters` : 'and no comment line is over 100 characters',
  ].join('\n  ')
);
