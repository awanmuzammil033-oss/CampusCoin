import { Link } from 'react-router-dom';

import Icon from './Icon.jsx';
import RenewalActions from './RenewalActions.jsx';
import { money, getLedgerCurrency } from '../money.js';
import { dayLabel } from '../dates.js';
import { useLocale } from '../locale.jsx';

/**
 * One subscription on the renewals screen: what it is, what it costs, the day
 * it next charges, and anything the vault has to say about it.
 *
 * Four rules shape this file, and each of them exists because the obvious
 * version is a lie:
 *
 * 1. THE DATE IS THE SERVER'S. `nextChargeOn` is the only place the app works
 *    out when a rule will charge, and this file never works a second date out
 *    for it. When the server sends none, the row says there is no charge
 *    scheduled - it does not help out with a date of its own.
 * 2. URGENCY IS WORDS FIRST. "Charges today" and "Charges in 3 days" carry it
 *    on their own, so the colour and the glyph beside them only repeat a
 *    message that is already on screen. A reader who cannot see the tint still
 *    knows what is about to happen.
 * 3. THE VAULT'S VERDICT IS THE VAULT'S SENTENCE. The same five keys, the same
 *    pills and the same glyphs the vault page uses, on a second line under the
 *    date rather than in place of it. A payment can be both "not used lately"
 *    and "charging in three days", and a screen that shows only one of those
 *    is pushing the student towards the wrong decision.
 * 4. MONEY IS QUOTED IN THE CURRENCY IT IS IN. The server names the currency of
 *    every row. When it is the ledger's own, `money()` converts it the way every
 *    other screen in the app does; when it is not, the figure is printed in that
 *    currency rather than relabelled into one the money is not in.
 */

/**
 * The vault's five verdicts, in the vault's own keys, pills and glyphs. Written
 * out rather than built from the id, so a key nobody can grep for is a key
 * nobody translates - and so a payment can never say two different things in
 * two places.
 */
const VERDICT = {
  'in-use': { key: 'vault.verdictInUse', cls: 'pill pill-income', icon: 'checkCircle' },
  idle: { key: 'vault.verdictIdle', cls: 'pill pill-expense', icon: 'hourglass' },
  'price-creep': { key: 'vault.verdictPriceCreep', cls: 'pill pill-suggest', icon: 'trendUp' },
  duplicate: {
    key: 'vault.verdictDuplicate',
    cls: 'pill',
    icon: 'copy',
    style: { background: 'var(--cc-danger-soft)', color: 'var(--cc-danger)' },
  },
  'one-off': { key: 'vault.verdictOneOff', cls: 'pill', icon: 'repeat' },
};

/** The four states the date line can be in. Each one has its own words. */
function whenOf(row, t) {
  // A cancelled entry is stopped first: the server leaves the pause date on a
  // cancelled rule, so a pause that has not run out would otherwise be reported
  // for a payment that is never going to be made again.
  if (row.isActive === false) return { state: 'stopped', icon: 'ban', text: t('sub.cancelledNote') };
  if (row.isPaused) {
    // The end of a pause is the day the hold lifts, not necessarily a day the
    // money moves: the next occurrence of the series can be a week or a month
    // after it. The server's own note on the report is that it must not point at
    // a date the money will not move on, so this line names the pause, and the
    // real next charge date is what the resume toast says afterwards, from the
    // server's own answer.
    return { state: 'held', icon: 'clock', text: t('sub.pausedUntil', { date: dayLabel(row.pausedUntil) }) };
  }
  const days = row.daysUntil;
  if (days === 0) return { state: 'now', icon: 'bell', text: t('sub.nextToday') };
  if (days === 1) return { state: 'now', icon: 'bell', text: t('sub.nextTomorrow') };
  // `daysUntil` is a count of days from the server, and a count that somehow
  // arrived behind today is shown as a date rather than as "-2 days".
  if (typeof days === 'number' && days > 1) return { state: 'soon', icon: 'calendar', text: t('sub.nextIn', { n: days }) };
  if (row.nextChargeOn) return { state: 'soon', icon: 'calendar', text: t('sub.nextOn', { date: dayLabel(row.nextChargeOn) }) };
  return { state: 'stopped', icon: 'ban', text: t('sub.nextNone') };
}

/** What a row calls itself when the description is empty. */
export function rowName(row, t) {
  return row.description || row.categoryName || t('sub.categoryUnknown');
}

/**
 * An amount in the currency the row says it is in.
 *
 * The ledger currency is what the student typed, so `money()` handles it (and
 * converts it to the reader's chosen currency on the way). Anything else is
 * quoted where it stands - the same principle as the group's books, which print
 * in the group's own currency because a document in one currency is the only
 * kind anybody can check.
 */
function rowAmount(value, currency) {
  if (!currency || currency === getLedgerCurrency()) return money(value);
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${String(currency).toUpperCase()} ${amount.toFixed(2)}`;
  }
}

export default function RenewalRow({ row, defaultWindow, onPause, onResume, onCancel, onReminder }) {
  const { t, plural } = useLocale();

  const name = rowName(row, t);
  const amount = rowAmount(row.amount, row.currency);
  const verdict = row.vaultVerdict ? VERDICT[row.vaultVerdict] : null;
  const when = whenOf(row, t);
  const inert = row.isActive === false;

  // The quiet facts under the date: how often it charges, and what the ledger
  // has actually seen of it. Both are the server's; nothing here adds up.
  const parts = [];
  if (row.frequency === 'weekly') parts.push(t('sub.frequencyWeekly'));
  else if (row.frequency === 'monthly') parts.push(t('sub.frequencyMonthly'));
  if (row.lastChargeOn) {
    parts.push(t('sub.lastOn', { date: dayLabel(row.lastChargeOn) }));
    if (Number(row.monthsCharged) > 0) {
      parts.push(plural('sub.monthsCharged', row.monthsCharged, { n: row.monthsCharged }));
    }
  } else {
    parts.push(t('sub.neverCharged'));
  }

  const dateLine = (
    <>
      <Icon name={when.icon} size={15} /> {when.text}
    </>
  );

  const body = (
    <>
      <div className="cc-renew-head d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div className="cc-renew-id" style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2 className="cc-renew-name" style={{ overflowWrap: 'anywhere' }}>
            {name}
          </h2>
          <span className="smallish muted">{row.categoryName || t('sub.categoryUnknown')}</span>
        </div>
        <span className="num cc-renew-amount">{t('sub.eachAmount', { amount })}</span>
      </div>

      {/*
        The date line is written out four times, one literal class per state,
        rather than assembled from a variable. A hook built at runtime is a hook
        the stylesheet check cannot see, and a hook the check cannot see is a
        hook that ships with no rule - which is how the landing page once
        rendered thirty class names as run-on text with a green build.
      */}
      {when.state === 'held' && <p className="cc-renew-when cc-renew-when-held">{dateLine}</p>}
      {when.state === 'now' && <p className="cc-renew-when cc-renew-when-now">{dateLine}</p>}
      {when.state === 'stopped' && <p className="cc-renew-when cc-renew-when-stopped">{dateLine}</p>}
      {when.state === 'soon' && <p className="cc-renew-when cc-renew-when-soon">{dateLine}</p>}

      <p className="cc-renew-line smallish muted">
        {parts.map((part, i) => (
          <span key={part}>
            {i > 0 ? ' · ' : ''}
            {part}
          </span>
        ))}
      </p>

      {verdict && (
        <p className="cc-renew-verdict">
          <span className={verdict.cls} style={verdict.style}>
            <Icon name={verdict.icon} size={13} /> {t(verdict.key)}
          </span>{' '}
          <span className="smallish muted">{t('sub.vaultVerdict')}</span>{' '}
          <Link className="cc-renew-vaultlink" to="/vault">
            {t('sub.vaultLink')}
          </Link>
        </p>
      )}

      <RenewalActions
        row={row}
        name={name}
        amount={amount}
        defaultWindow={defaultWindow}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onReminder={onReminder}
      />
    </>
  );

  // A cancelled entry keeps its card, its history and its place in the list, and
  // is drawn inert. It is not hidden: the charges it already made are in the
  // ledger, and a student looking for them should be able to see what stopped.
  return inert ? (
    <article className="card cc-renew-row cc-renew-inert">{body}</article>
  ) : (
    <article className="card cc-renew-row">{body}</article>
  );
}
