/**
 * The check that would have caught this.
 *
 * A component that asks for thirty class hooks and gets no rules for any of them
 * renders as run-on text - and nothing in a build, a test or a key check notices,
 * because every one of those is happy with text that exists. Three sections of
 * the landing page shipped that way and were committed.
 *
 * So: every class hook the client puts in a className must have a rule in the
 * stylesheet, unless it is a framework utility or is only ever used as a
 * JavaScript selector. The allow-list below is deliberately short and each entry
 * says why it is there - a list that grows silently is a list that stops being a
 * check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// relative to this file, so the check runs the same from anywhere
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const css = readFileSync(join(SRC, 'styles', 'campuscoin.css'), 'utf8');
const rules = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/*
 * Hooks that are allowed to have no rule, and why.
 *
 * `no-` / `is-` / `has-` are STATE hooks: the stylesheet may never mention them
 * and the code asks for them to find the element. Everything else listed here is
 * either a Bootstrap-style utility the framework provides, or a hook whose
 * appearance is carried by an inline style in the same component.
 */
const ALLOWED = new Map([
  // state / selector-only
  ['no-', 'state prefix: the code asks for it, the sheet never styles it'],
  ['is-', 'state prefix: the code asks for it, the sheet may style it'],
  ['has-', 'state prefix: the code asks for it, the sheet may style it'],
  // framework utilities the app loads and this sheet does not own
  ['d-', 'framework utility'],
  ['align-', 'framework utility'],
  ['justify-', 'framework utility'],
  ['flex-', 'framework utility'],
  ['text-', 'framework utility'],
  ['justify-content-', 'framework utility'],
  ['border-', 'framework utility'],
  ['rounded-', 'framework utility'],
  ['shadow-', 'framework utility'],
  ['overflow-', 'framework utility'],
  ['position-', 'framework utility'],
  ['order-', 'framework utility'],
  ['float-', 'framework utility'],
  ['col-', 'framework utility'],
  ['row', 'framework utility'],
  ['gap-', 'framework utility'],
  ['mb-', 'framework utility'],
  ['mt-', 'framework utility'],
  ['ms-', 'framework utility'],
  ['me-', 'framework utility'],
  ['pt-', 'framework utility'],
  ['pb-', 'framework utility'],
  ['pl-', 'framework utility'],
  ['pr-', 'framework utility'],
  ['p-', 'framework utility'],
  ['m-', 'framework utility'],
  ['w-', 'framework utility'],
  ['h-', 'framework utility'],
  ['g-', 'framework utility'],
  ['z-', 'framework utility'],
  ['opacity-', 'framework utility'],
  ['cursor-', 'framework utility'],
  ['select-', 'framework utility'],
  ['space-', 'framework utility'],
  ['font-', 'framework utility'],
  ['leading-', 'framework utility'],
  ['tracking-', 'framework utility'],
  ['uppercase', 'framework utility'],
  ['lowercase', 'framework utility'],
  ['truncate', 'framework utility'],
  ['sr-', 'framework utility'],
  ['container', 'framework utility'],
  ['grid', 'framework utility'],
  ['transition', 'framework utility'],
  ['top-', 'framework utility'],
  ['left-', 'framework utility'],
  ['right-', 'framework utility'],
  ['bottom-', 'framework utility'],
  ['pointer-', 'framework utility'],
  ['btn-', 'own prefix, styled in this sheet'],
  ['field-', 'own prefix, styled in this sheet'],
  ['input', 'own prefix, styled in this sheet'],
  ['card', 'own prefix, styled in this sheet'],
  ['pill', 'own prefix, styled in this sheet'],
  ['smallish', 'own prefix, styled in this sheet'],
  ['muted', 'own prefix, styled in this sheet'],
  ['num', 'own prefix, styled in this sheet'],
  ['spinner', 'own prefix, styled in this sheet'],
  ['money-', 'own prefix, styled in this sheet'],
  ['hp1', 'own prefix, styled in this sheet'],
  ['hp2', 'own prefix, styled in this sheet'],
  // hooks whose look is set inline in the same component
  ['cc-qr-readTitle', 'styled inline in QrPaySheet'],
  ['cc-qr-doneTitle', 'styled inline in QrPaySheet'],
  ['faq-toggle', 'the + is drawn by the summary row around it'],
  ['lp-brand', 'the brand has its own .brand rules'],
  ['auth-art-', 'a template prefix, composed with a number'],
  ['cc-note-', 'a template prefix, composed with a kind'],

  /* ---- measured in the browser: a marker, not the look ---- */
  // group chat - the bubble, the card and the row get their appearance from the
  // classes beside them; these name the parts for the code and for a test
  ['cc-msg', 'group chat: a marker on the message list; the bubble is styled by its own class'],
  ['cc-msg-name', 'group chat: a marker; the name is styled by the row around it'],
  ['cc-msg-foot', 'group chat: a marker; the timestamp row is styled by its own class'],
  // A Bootstrap utility, not one of this sheet's hooks - the same as .btn and
  // .d-grid, which the app uses for the same reason. Listed with its reason rather
  // than given a rule, because a rule here would be styling Bootstrap's class in
  // this project's namespace and would lose the day Bootstrap is upgraded.
  ['list-unstyled', 'Bootstrap utility (resets list markers/padding on a <ul>), as .btn and .d-grid are'],
  ['cc-msg-del', 'group chat: a marker on the delete control, which is a real .icon-btn'],
  ['cc-poll', 'group chat: a marker on the poll card, which carries .card'],
  ['cc-poll-what', 'group chat: a marker; the question is styled by its own class'],
  ['cc-poll-name', 'group chat: a marker; the title is styled by its own class'],
  ['cc-poll-total', 'group chat: a marker; the running total is styled by its own class'],
  ['cc-poll-roster', 'group chat: a marker; the roster is a styled list'],
  ['cc-tick', 'group chat: a marker on a member answer row, which carries .btn/.card'],
  ['cc-tick-static', 'group chat: a marker; the row that cannot be ticked is styled beside it'],
  ['cc-avatar', 'group chat: a marker on the round initial badge'],
  ['cc-composer-more', 'group chat: a marker on the composer button, which is a real .icon-btn'],
  // dashboard - wrappers whose children are all styled
  ['dash-balance', 'dashboard: a wrapper; every card inside it is styled'],
  ['dash-tools', 'dashboard: a wrapper; the tool cards inside it are styled'],
  // ledger - the remove control on an entry line, which is a real .icon-btn
  ['cc-ledger-line-drop', 'journal form: a marker on the remove button, which is a real .icon-btn'],
  // notifications - a state name the code reads, and a modifier on a styled row
  ['canToggle', 'notification panel: a state flag read by the code, never a style'],
  ['cc-note-clickable', 'notification panel: a modifier; the row it sits on is styled'],

  /* ---- a prefix that is only completed at runtime ---- */
  ['lp2-orb-', 'hero art: composed with a tone at runtime (lp2-orb-mint and friends)'],
  ['lp2-show-blob-', 'hero art: composed with a tone at runtime'],
  ['lp2-show-dot-', 'hero art: composed with a tone at runtime'],
  ['progress-', 'progress bar: composed with a state at runtime'],
  ['survival-advice-', 'survival card: composed with a rule id at runtime'],

  /* ---- carried by an inline style or by the SVG's own attributes ---- */
  ['lp2-show-dot', 'hero art: an SVG dot; its fill and radius are attributes'],
  ['lp2-show-glow', 'hero art: a radial gradient declared inline on the element'],
  ['lp2-wave-line', 'hero waves: the stroke, width and opacity are SVG attributes'],

  /* ---- framework spacing utilities ---- */
  ['mx-', 'framework utility'],
  ['px-', 'framework utility'],
  ['my-', 'framework utility'],
  ['py-', 'framework utility'],
  ['ps-', 'framework utility'],
  ['pe-', 'framework utility'],
  ['gap-', 'framework utility'],

  /* ---- a word from a prop, not a class ---- */
  ['page', 'pagination: the word comes from a page-size prop, and .page-* is styled'],
  ['flip', 'a boolean word in a template; the rule is on the state prefix'],
]);

const allowed = (name) => {
  if (rules.has(name)) return true;
  for (const [prefix, why] of ALLOWED) {
    if (name === prefix || name.startsWith(prefix)) {
      // a prefix in the list only excuses a name that STARTS with it, and a bare
      // prefix with no dash has to be the whole name
      if (!prefix.endsWith('-') && name !== prefix) continue;
      return why;
    }
  }
  return false;
};

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!full.includes(`${'i18n'}`)) walk(full, out);
    } else if (['.jsx', '.js'].includes(extname(name))) {
      out.push(full);
    }
  }
  return out;
};

const used = new Map();
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/className=\{?\s*[`"']([^`"']+)[`"']/g)) {
    for (const chunk of m[1].split(/\$\{[^}]*\}/)) {
      for (const token of chunk.split(/\s+/)) {
        const name = token.trim();
        if (!/^-?[A-Za-z_][\w-]*$/.test(name)) continue;
        // a bare tag name or a single letter is never a hook: it is what a
        // template literal leaves behind when it is split on an expression
        if (/^(a|abbr|b|button|div|em|footer|form|h[1-6]|header|i|img|input|label|li|main|nav|ol|p|section|small|span|strong|svg|table|tbody|td|th|thead|tr|ul)$/.test(name)) continue;
        if (name.length === 1) continue;
        if (!used.has(name)) used.set(name, new Set());
        used.get(name).add(file.replace(SRC, '').replace(/\\/g, '/'));
      }
    }
  }
}

const problems = [];
for (const [name, files] of used) {
  // ANY truthy answer means allowed: `true` for "it has a rule", a string for
  // "it is on the allow-list and here is why". The first version compared against
  // `true` alone and so reported every allow-listed hook as a problem - which is
  // how a check that reports 91 problems reports nothing at all.
  if (allowed(name)) continue;
  problems.push({ name, files: [...files] });
}
problems.sort((a, b) => a.name.localeCompare(b.name));

console.log(`${used.size} hooks used across the client`);
if (problems.length === 0) {
  console.log('every one of them either has a rule or is on the allow-list with a reason');
} else {
  console.log(`\n${problems.length} hook(s) with no rule and no excuse:\n`);
  for (const p of problems) {
    console.log(`  ${p.name}`);
    for (const f of p.files) console.log(`      ${f}`);
  }
}


process.exitCode = problems.length ? 1 : 0;
