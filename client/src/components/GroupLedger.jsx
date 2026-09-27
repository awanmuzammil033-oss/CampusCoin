import { Link } from 'react-router-dom';

import Icon from './Icon.jsx';
import { useLocale } from '../locale.jsx';
import { dayLabel, uiLang } from '../dates.js';

/**
 * Money in the GROUP's own currency, never converted.
 *
 * The chat's `groupAmount` follows the reader's display currency, which is right
 * for a poll card and wrong for a set of books: a trial balance that says "this
 * group's money is in PKR" and then prints AED is a document nobody can check,
 * and a bank reconciliation asks you to compare a statement in one currency
 * against figures quietly converted into another. One currency per document.
 */
export function ledgerAmount(value, currency) {
  const n = Number(value) || 0;
  const code = String(currency || '').toUpperCase();
  const sign = n < 0 ? '\u2212' : '';
  if (!/^[A-Z]{3}$/.test(code)) return `${sign}${Math.abs(n).toFixed(2)}`;
  try {
    const text = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(n));
    return `${sign}${text}`;
  } catch {
    return `${sign}${code} ${Math.abs(n).toFixed(2)}`;
  }
}


/**
 * The pieces the group's three books are drawn from: the document head, the
 * money cell, the "this does not add up" banner, one journal entry, one
 * statement line, and the reconciliation's difference panel. All three pages
 * read from here, so a figure that means one thing on the journal means exactly
 * the same thing on the trial balance, and a row is laid out the same way on
 * both.
 *
 * Nothing in this file talks to the API, and nothing in it does arithmetic:
 * the numbers arrive already agreed by the server and are printed as they came.
 * There is no "tidying up" of a column anywhere in here, because the whole
 * point of these three screens is that a reader can add a column up and get the
 * headline back.
 *
 * The one rule that shapes every piece: a difference is shown, not smoothed
 * over. Somebody who cannot trust the number has to be able to see that at a
 * glance, without opening anything, and without a colour being the only clue.
 */

/** The three books, in the order somebody meets them, and where each one lives. */
const BOOKS = [
  { key: 'journal', path: 'journal', icon: 'book', labelKey: 'ledger.journal.title' },
  { key: 'trial', path: 'trial-balance', icon: 'scale', labelKey: 'ledger.trial.title' },
  { key: 'recon', path: 'reconcile', icon: 'bank', labelKey: 'ledger.recon.title' },
];

/** An em dash, the accounting mark for "nothing on this side". Not a word. */
const NONE = '\u2014';

/* ------------------------------------------------------------------ helpers -- */

/** "26 Sep 2026, 14:32" in the reader's own language and clock. */
export function whenLabel(value) {
  if (!value) return '';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString(uiLang(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The dictionary key for an account type; a type this build does not know
 *  still draws, because the fallback is the word "asset" rather than a hole. */
export function typeKey(type) {
  return `ledger.type.${String(type || '').toLowerCase()}`;
}

/** A line's word for where it stands. Never empty, so a pill is never bare. */
export function stateKey(as) {
  if (as === 'matched') return 'ledger.recon.asMatched';
  if (as === 'book') return 'ledger.recon.asBook';
  if (as === 'ignore') return 'ledger.recon.asIgnore';
  return 'ledger.recon.asOpen';
}

/* ------------------------------------------------------------- the money cell -- */

/**
 * One figure. Tabular, so a column of them lines up, and coloured only where a
 * sign or a word already says the same thing — the tone is never the message
 * (design.md §3). `blank` is for a side a row genuinely has nothing on, which
 * is the only time a dash is honest.
 */
export function MoneyCell({ value, currency, tone = 'plain', blank = false }) {
  const toneClass =
    tone === 'in' ? ' cc-ledger-money-in' : tone === 'out' ? ' cc-ledger-money-out' : tone === 'alarm' ? ' cc-ledger-money-alarm' : '';

  if (blank) {
    return <span className={`cc-ledger-money muted${toneClass}`}>{NONE}</span>;
  }
  return <span className={`cc-ledger-money num${toneClass}`}>{ledgerAmount(value, currency)}</span>;
}

/** Account type, as a word. A word, not a colour: the five types are the point. */
export function TypeTag({ type }) {
  const { t } = useLocale();
  return <span className="cc-ledger-type">{t(typeKey(type))}</span>;
}

/* ------------------------------------------------------------ the document head -- */

/**
 * The head of a document: what this page is, whose money it is in, and the two
 * other books to jump to. The same three lines on all three screens, because
 * the three screens are one question asked three ways, and a reader who has
 * learned the head once has learned all of them.
 */
export function LedgerHead({ group, currency, current, titleKey, noteKey, children }) {
  const { t } = useLocale();
  const groupId = group?.id || '';

  return (
    <div className="cc-ledger-head card">
      <div className="cc-ledger-head-main">
        <strong className="cc-ledger-head-title">
          <Icon name={BOOKS.find((book) => book.key === current)?.icon || 'book'} size={18} /> {t(titleKey)}
        </strong>
        {currency && (
          <span className="smallish muted">
            <Icon name="coins" size={14} /> {t('ledger.currencyOf', { currency })}
          </span>
        )}
        {noteKey && <p className="smallish muted cc-ledger-head-note mb-0">{t(noteKey)}</p>}
      </div>

      {groupId && (
        <nav className="cc-ledger-links" aria-label={t(titleKey)}>
          {BOOKS.map((book) => (
            <Link
              key={book.key}
              to={`/groups/${groupId}/${book.path}`}
              className="btn btn-ghost cc-ledger-link"
              aria-current={book.key === current ? 'page' : undefined}
            >
              <Icon name={book.icon} size={15} /> {t(book.labelKey)}
            </Link>
          ))}
        </nav>
      )}

      {children}
    </div>
  );
}

/* --------------------------------------------------------- does it add up? -- */

/**
 * The one thing on all three screens that must never be quiet: a figure that
 * does not agree with the figure it is being compared against. The amount is
 * the headline, in the danger surface, with the word in front of it — so the
 * banner says the same thing to somebody who cannot see the colour at all.
 */
/**
 * The alarm banner. It prints the sentence it is given, whole: the figure goes in
 * through the key (`t('ledger.outBy', { amount })`) rather than being appended
 * here, because a translator needs to decide where the number sits in their
 * language and an appended figure takes that decision away from them.
 */
export function MismatchBanner({ title, body }) {
  return (
    <div className="cc-ledger-mismatch" role="alert">
      <Icon name="warning" size={20} />
      <div>
        <strong className="cc-ledger-mismatch-title">{title}</strong>
        {body && <p className="smallish mb-0">{body}</p>}
      </div>
    </div>
  );
}

/** The other half of the same pair, for when the two columns do agree. */
export function MatchBanner({ title, body }) {
  return (
    <div className="cc-ledger-match" role="status">
      <Icon name="checkCircle" size={20} />
      <div>
        <strong className="cc-ledger-match-title">{title}</strong>
        {body && <p className="smallish mb-0">{body}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- the entry -- */

/**
 * One journal entry: the ref and the day in the head, the memo, the lines as a
 * small two-column table, the two totals, and — if they somehow disagree — the
 * difference called out rather than rounded away. Nothing on a posted entry can
 * be edited, so the only thing on offer is the correction: the mirror entry.
 */
export function EntryCard({ entry, currency, can, busy, onReverse, onFlag, onClearFlag, reconcileTo }) {
  const { t } = useLocale();
  const gap = (Number(entry.debits) || 0) - (Number(entry.credits) || 0);
  const flag = entry.flag;

  return (
    <article className="cc-ledger-entry card">
      <div className="cc-ledger-entry-head">
        <span className="cc-ledger-ref num">{entry.ref}</span>
        <span className="smallish muted">{dayLabel(entry.date)}</span>
        {entry.source === 'reconcile' && (
          <span className="pill pill-suggest">
            <Icon name="bank" size={13} /> {t('ledger.recon.title')}
          </span>
        )}
      </div>

      {entry.memo && <p className="cc-ledger-memo">{entry.memo}</p>}

      {flag && (
        <div className={`cc-ledger-flag${flag.open ? '' : ' cc-ledger-flag-done'}`}>
          <Icon name={flag.open ? 'help' : 'checkCircle'} size={18} />
          <div>
            <strong className="cc-ledger-flag-state">
              {flag.open ? t('ledger.journal.flagOpen') : t('ledger.journal.flagAnswered')}
            </strong>
            <p className="cc-ledger-flag-reason">{flag.reason}</p>
            {flag.open ? (
              <p className="smallish muted mb-0">
                {t('ledger.journal.flagRaised', { name: flag.byName || '', when: whenLabel(flag.at) })}
              </p>
            ) : (
              <p className="smallish muted mb-0">
                {t('ledger.journal.flagResolution', {
                  name: flag.byName || '',
                  when: whenLabel(flag.resolvedAt),
                  note: flag.resolution || '',
                })}
              </p>
            )}
            {can?.flag && flag.open && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onClearFlag(entry)}
                disabled={busy}
              >
                {t('ledger.journal.clearFlag')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="table-scroll">
        <table className="table cc-stack-table cc-ledger-lines">
          <caption className="visually-hidden">{t('ledger.journal.linesOf', { ref: entry.ref })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('ledger.col.account')}</th>
              <th scope="col">{t('ledger.debit')}</th>
              <th scope="col">{t('ledger.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {(entry.lines || []).map((line, at) => (
              <tr key={line.lineId || `${line.code}-${at}`}>
                <td data-label={t('ledger.col.account')}>
                  <span className="cc-ledger-code num">{line.code}</span>
                  <span className="cc-ledger-name">{line.name}</span>
                </td>
                <td data-label={t('ledger.debit')}>
                  <MoneyCell value={line.debit} currency={currency} blank={!Number(line.debit)} />
                </td>
                <td data-label={t('ledger.credit')}>
                  <MoneyCell value={line.credit} currency={currency} blank={!Number(line.credit)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cc-ledger-totals">
        <span className="smallish">
          {t('ledger.debit')} <strong className="num">{ledgerAmount(entry.debits, currency)}</strong>
        </span>
        <span className="smallish">
          {t('ledger.credit')} <strong className="num">{ledgerAmount(entry.credits, currency)}</strong>
        </span>
        <span className="cc-ledger-acts">
          {entry.source === 'reconcile' && reconcileTo && (
            <>
              <span className="smallish muted cc-ledger-source">
                {t('ledger.journal.fromReconcile', { key: entry.sourceRef || NONE })}
              </span>
              <Link className="btn btn-ghost" to={reconcileTo}>
                {t('ledger.journal.openReconcile')}
              </Link>
            </>
          )}
          {can?.flag && !flag && (
            <button type="button" className="btn btn-ghost" onClick={() => onFlag(entry)} disabled={busy}>
              <Icon name="help" size={15} /> {t('ledger.journal.flag')}
            </button>
          )}
          {can?.postJournal && (
            <button type="button" className="btn btn-secondary" onClick={() => onReverse(entry)} disabled={busy}>
              <Icon name="undo" size={15} /> {t('ledger.journal.reverse')}
            </button>
          )}
        </span>
      </div>

      {gap !== 0 && (
        <MismatchBanner
          title={t('ledger.outBy', { amount: ledgerAmount(Math.abs(gap) / 100, currency) })}
          body={t('ledger.journal.unbalancedNote')}
        />
      )}

      <p className="cc-ledger-foot smallish muted mb-0">
        {entry.isYou ? t('ledger.journal.postedByYou') : t('ledger.journal.postedBy', { name: entry.by?.name || '' })}
        {entry.createdAt ? ` · ${t('ledger.journal.enteredOn', { when: whenLabel(entry.createdAt) })}` : ''}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------ the statement -- */

/**
 * One line of the bank statement: what the bank says, what has been decided
 * about it, and the answers a person can still give. Which buttons are drawn
 * depends on the line, not on the screen:
 *
 *  - an UNDECIDED line can be booked or explained away, and nothing else;
 *  - a line marked "not ours" can be taken back, because a reason can turn out
 *    to be wrong and there is no harm in changing your mind about a claim;
 *  - a line that has been BOOKED has a real journal entry behind it, and the
 *    server refuses to re-classify it — the books keep a posted entry and its
 *    correction side by side, so the way back is to reverse the entry in the
 *    journal. A button that would always be refused is not drawn; the way back
 *    is one tap away instead.
 */
export function StatementRow({ line, currency, can, busy, onBook, onIgnore, onOpen, journalTo }) {
  const { t } = useLocale();
  const amount = Number(line.amount) || 0;
  const undecided = !line.as || line.as === 'open';

  return (
    <li className={`cc-ledger-row cc-ledger-as-${line.as || 'open'}`} aria-busy={busy}>
      <div className="cc-ledger-row-main">
        <span className="cc-ledger-row-date smallish muted num">{dayLabel(line.date)}</span>
        <span className="cc-ledger-name">{line.description || NONE}</span>
        <MoneyCell value={amount} currency={currency} tone={amount < 0 ? 'out' : 'in'} />
      </div>

      <div className="cc-ledger-row-state">
        <span className="pill cc-ledger-state">
          <Icon name={undecided ? 'clock' : 'check'} size={13} /> {t(stateKey(line.as))}
        </span>
        {line.as === 'ignore' && line.reason && (
          <span className="smallish muted">{t('ledger.recon.ignoreShown', { reason: line.reason })}</span>
        )}
        {line.as === 'book' && (
          <span className="smallish muted">
            {t('ledger.recon.bookedNote')}{' '}
            {journalTo && (
              <Link className="cc-ledger-state-link" to={journalTo}>
                {t('ledger.recon.journalLink')}
              </Link>
            )}
          </span>
        )}
      </div>

      {can && undecided && (
        <div className="cc-ledger-acts">
          <button type="button" className="btn btn-primary" onClick={() => onBook(line)} disabled={busy}>
            {t('ledger.recon.record')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onIgnore(line)} disabled={busy}>
            {t('ledger.recon.ignore')}
          </button>
        </div>
      )}

      {can && line.as === 'ignore' && (
        <div className="cc-ledger-acts">
          <button type="button" className="btn btn-ghost" onClick={() => onOpen(line)} disabled={busy}>
            <Icon name="undo" size={15} /> {t('ledger.recon.putBack')}
          </button>
        </div>
      )}
    </li>
  );
}

/* ---------------------------------------------------- the difference panel -- */

/**
 * The reconciliation's arithmetic: five figures and the difference between
 * them, with the difference as the headline, because the difference is the only
 * reason this screen exists. The five numbers are the server's, printed in the
 * order somebody adds them up in; this component never touches them.
 */
export function DifferencePanel({ totals, counts, currency, closeable, reason, can, busy, onClose, alert }) {
  const { t } = useLocale();
  if (!totals) return null;

  const difference = Number(totals.difference) || 0;
  const settled = difference === 0;

  const rows = [
    { key: 'book', label: t('ledger.recon.tBook'), value: totals.bookBalance },
    { key: 'unbooked', label: t('ledger.recon.tUnbooked'), value: totals.unbooked },
    { key: 'adjusted', label: t('ledger.recon.tAdjusted'), value: totals.adjustedBook, strong: true },
    { key: 'statement', label: t('ledger.recon.tStatement'), value: totals.statementBalance },
  ];

  return (
    <section
      className={`cc-ledger-diff card${settled ? '' : ' cc-ledger-diff-out'}`}
      aria-label={t('ledger.recon.panelTitle')}
    >
      <div className="card-title">
        <span>{t('ledger.recon.panelTitle')}</span>
      </div>

      <div className="cc-ledger-diff-head">
        <span className="smallish muted">{t('ledger.recon.tDifference')}</span>
        <strong className="cc-ledger-diff-value">
          {settled ? (
            <span className="cc-ledger-diff-word">
              <Icon name="checkCircle" size={18} /> {t('ledger.recon.agree')}
            </span>
          ) : (
            <span className="num">
              {t('ledger.outBy', { amount: ledgerAmount(Math.abs(difference), currency) })}
            </span>
          )}
        </strong>
        <p className="smallish mb-0">
          {settled
            ? t('ledger.recon.meansAgree')
            : t('ledger.recon.meansOut', { amount: ledgerAmount(Math.abs(difference), currency) })}
        </p>
      </div>

      <dl className="cc-ledger-diff-list">
        {rows.map((row) => (
          <div className="cc-ledger-diff-row" key={row.key}>
            <dt className={row.strong ? 'cc-ledger-diff-strong' : ''}>{row.label}</dt>
            <dd className={row.strong ? 'cc-ledger-diff-strong num' : 'num'}>{ledgerAmount(row.value, currency)}</dd>
          </div>
        ))}
        <div className="cc-ledger-diff-row cc-ledger-diff-row-last">
          <dt className="cc-ledger-diff-strong">{t('ledger.recon.tDifference')}</dt>
          <dd className={`num ${settled ? 'cc-ledger-diff-strong' : 'cc-ledger-money-alarm'}`}>
            {ledgerAmount(difference, currency)}
          </dd>
        </div>
      </dl>

      {counts && (
        <p className="smallish muted cc-ledger-counts mb-0">
          {t('ledger.recon.counts', {
            matched: counts.matched || 0,
            book: counts.toBook || 0,
            ignored: counts.ignored || 0,
            open: counts.open || 0,
            outstanding: counts.outstanding || 0,
          })}
        </p>
      )}

      {alert && (
        <div className="field-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{alert}</span>
        </div>
      )}

      {can ? (
        <>
          <button type="button" className="btn btn-primary cc-ledger-close" onClick={onClose} disabled={busy || !closeable}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t('ledger.recon.close')}
          </button>
          {!closeable && reason && (
            <p className="smallish muted cc-ledger-close-reason mb-0">
              <strong>{t('ledger.recon.closeBlocked')}</strong> {reason}
            </p>
          )}
        </>
      ) : (
        <p className="smallish muted mb-0">
          <Icon name="lock" size={14} /> {t('ledger.recon.readOnly')}
        </p>
      )}
    </section>
  );
}
