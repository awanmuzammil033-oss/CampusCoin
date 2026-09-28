import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RenewalRow, { rowName } from '../components/RenewalRow.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { dayLabel } from '../dates.js';
import { useLocale } from '../locale.jsx';

/**
 * Renewals (NEW-6, client side): what is about to charge this student, and when.
 *
 * A subscription here is not a new kind of thing to be created - it is a
 * recurring expense the student already owns, read from the same rules the
 * ledger generator walks. That is why this screen has no form: it cannot create
 * a subscription, and the one place that can is the recurring screen, which this
 * one links to. It also cannot promise anything the ledger would not honour,
 * because every date on it is the one the server derived.
 *
 * What this screen will not do:
 *
 *  - It adds nothing up. The strip at the top is the server's `totals`, the
 *    order of the list is the server's sort, and a monthly figure is labelled
 *    as what the list adds up to rather than as a fact about next month.
 *  - It does not sort. The server puts the soonest charge first and anything
 *    with no charge coming at the bottom; re-sorting here would move a row
 *    under the reader's finger every time the list refreshed.
 *  - It does not make a cancel look reversible. Stopping an entry stops it: the
 *    history stays in the ledger and no undo is offered, because the payment
 *    itself has to be stopped with the company.
 *  - It does not paint a warning like a bill. The bell that says a charge is
 *    coming is in the notifications, where the charge that has already left
 *    lives too; this screen only ever says what is scheduled.
 */

export default function SubscriptionsPage() {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState([]);
  // The warning window the server uses when an entry names none of its own. It
  // is quoted, never guessed: the read above raises the warnings, and the check
  // beside it is what tells the screen how many days ahead that was.
  const [defaultWindow, setDefaultWindow] = useState(null);
  const [note, setNote] = useState('');
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState(0);

  async function load(categoryId) {
    try {
      // Both reads, or neither. The list alone would leave the reminder control
      // unable to name the server's own default, and a reminder control that
      // guesses its own default is a student being warned on somebody else's
      // terms. The check is idempotent - the unique index means running it
      // twice inserts nothing - so asking it again costs no second warning.
      const [report, check] = await Promise.all([
        api.get(`/api/subscriptions${qs({ categoryId })}`),
        api.post('/api/subscriptions/check', {}),
      ]);
      const rows = Array.isArray(report.rows) ? report.rows : [];
      setData({ rows, totals: report.totals || {}, reminders: Number(report.reminders) || 0 });
      // The filter is a choice from the whole list, so the choices are the
      // categories of the unfiltered read and are kept while a filter is on -
      // otherwise picking one would remove the way back out of it.
      if (!categoryId) {
        const seen = new Map();
        rows.forEach((row) => {
          if (row.categoryId && !seen.has(row.categoryId)) seen.set(row.categoryId, row.categoryName);
        });
        setOptions([...seen.entries()].map(([id, name]) => ({ id, name })));
      }
      setDefaultWindow(Number.isFinite(Number(check?.withinDays)) ? Number(check.withinDays) : null);
      setError('');
      return check;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    // A filter change must not leave the previous rows under the new filter's
    // heading: they are the wrong list, and a list of subscriptions that are
    // not the subscriptions is the one thing this screen must never show.
    setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    load(filter);
  }, [filter, version]);

  /**
   * The reminder check the reader asked for. It answers with the server's own
   * count of what is inside the window - so "nothing is due" is the server
   * saying so, not this screen failing to find anything.
   */
  async function checkAgain() {
    setChecking(true);
    try {
      const check = await load(filter);
      if (!check) return;
      const within = Number(check.withinDays) || 0;
      const due = Number(check.due) || 0;
      setNote(
        due > 0
          ? plural('sub.checked', due, { n: due, days: within })
          : t('sub.nothingDue', { days: within })
      );
    } finally {
      setChecking(false);
    }
  }

  /**
   * Every change goes through here. A 404 is not a permission problem and is not
   * shown as one: the entry is simply not here any more, so the list is read
   * again and the row that could not be changed leaves the screen. A 400 is the
   * server's own sentence about what is wrong with the request, and it is passed
   * on as it arrived.
   */
  async function act(work) {
    try {
      return await work();
    } catch (err) {
      if (err.status === 404) {
        await load(filter);
        throw new Error(t('sub.gone'));
      }
      throw err;
    }
  }

  async function pauseRow(row, days) {
    const res = await act(() => api.post(`/api/subscriptions/${row.ruleId}/pause`, { days }));
    push(t('sub.pauseDone', { name: rowName(row, t), date: dayLabel(res.pausedUntil) }));
    await load(filter);
  }

  async function resumeRow(row) {
    const res = await act(() => api.post(`/api/subscriptions/${row.ruleId}/resume`, {}));
    // The day the charges come back is the server's answer or it is nothing: a
    // resumed entry with no charge scheduled is not dressed up with a date.
    push(
      res.nextChargeOn
        ? t('sub.resumeDone', { name: rowName(row, t), date: dayLabel(res.nextChargeOn) })
        : t('sub.resumeDoneNoDate', { name: rowName(row, t) })
    );
    await load(filter);
  }

  async function cancelRow(row) {
    const res = await act(() => api.post(`/api/subscriptions/${row.ruleId}/cancel`, {}));
    push(t('sub.cancelled', { name: res.title || rowName(row, t) }));
    await load(filter);
  }

  async function setReminder(row, days) {
    await act(() => api.patch(`/api/subscriptions/${row.ruleId}`, { reminderDays: days }));
    push(t('ui.saved'));
    await load(filter);
  }

  /* --------------------------------- render -------------------------------- */

  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const filtered = Boolean(filter);

  return (
    <Page
      trail={[{ label: t('sub.title') }]}
      title={t('sub.title')}
      subtitle={t('sub.subtitle')}
      actions={
        <Link className="btn btn-secondary" to="/recurring">
          <Icon name="plus" size={15} /> {t('sub.emptyBtn')}
        </Link>
      }
    >
      {error ? (
        <div className="card cc-renew-error" role="alert">
          <h2 className="cc-renew-error-title">
            <Icon name="warning" size={18} /> {t('sub.errorTitle')}
          </h2>
          {/* the server's own sentence, not a friendlier invention of one */}
          <p className="smallish mb-3">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => setVersion((n) => n + 1)}>
            {t('sub.retry')}
          </button>
        </div>
      ) : (
        <>
          {data && (
            <>
              {/* -------------------------- the strip ------------------------- */}
              <section className="card cc-renew-totals" aria-label={t('sub.monthlyLabel')}>
                <span className="smallish muted">{t('sub.monthlyLabel')}</span>
                <div className="balance-display">{money(totals.monthly)}</div>
                <p className="smallish muted mb-0">{t('sub.monthlyNote')}</p>

                <dl className="d-grid gap-2 cc-renew-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', margin: '14px 0 0' }}>
                  <div className="cc-renew-stat">
                    <dt className="smallish muted">{t('sub.activeLabel')}</dt>
                    <dd className="num cc-renew-stat-figure">{Number(totals.active) || 0}</dd>
                  </div>
                  <div className="cc-renew-stat">
                    <dt className="smallish muted">{t('sub.pausedLabel')}</dt>
                    <dd className="num cc-renew-stat-figure">{Number(totals.paused) || 0}</dd>
                  </div>
                  <div className="cc-renew-stat">
                    <dt className="smallish muted">{t('sub.due7Label')}</dt>
                    <dd className="num cc-renew-stat-figure">{Number(totals.dueIn7) || 0}</dd>
                  </div>
                  <div className="cc-renew-stat">
                    <dt className="smallish muted">{t('sub.due30Label')}</dt>
                    <dd className="num cc-renew-stat-figure">{Number(totals.dueIn30) || 0}</dd>
                  </div>
                </dl>
              </section>

              {data.reminders > 0 && (
                /* what the read just did, in the app's quietest tone and with the
                   bell - a warning that has been raised, not a bill that has been paid */
                <p className="smallish muted cc-renew-reminders mt-3 mb-0">
                  <Icon name="bell" size={14} /> {plural('sub.remindersSent', data.reminders, { n: data.reminders })}
                </p>
              )}
            </>
          )}

          {/* ---------------------------- the controls ------------------------- */}
          <section className="card cc-renew-controls d-flex gap-3 flex-wrap align-items-end">
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <FormField label={t('sub.filterAria')} htmlFor="renew-category">
                {(a) => (
                  <select
                    id="renew-category"
                    className="input"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    style={{ maxWidth: '100%' }}
                    {...a}
                  >
                    <option value="">{t('sub.filterAll')}</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>

            <button type="button" className="btn btn-secondary cc-renew-check" onClick={checkAgain} disabled={checking}>
              {checking ? <span className="spinner" aria-hidden="true" /> : <Icon name="repeat" size={15} />}
              {t('sub.refresh')}
            </button>
          </section>

          {note && (
            <p className="smallish cc-renew-note" role="status">
              {note}
            </p>
          )}

          {/* ------------------------------ the list --------------------------- */}
          {!data ? (
            <div className="card" role="status">
              <div className="skeleton" style={{ height: 56, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 56, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 56 }} />
              <p className="smallish muted mb-0 mt-3">{t('sub.loading')}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="card">
              {filtered ? (
                <EmptyState icon="repeat" title={t('sub.emptyFiltered')}>
                  {t('sub.emptyFilteredBody')}
                </EmptyState>
              ) : (
                <EmptyState
                  icon="repeat"
                  title={t('sub.emptyTitle')}
                  action={
                    <Link className="btn btn-primary mt-2" to="/recurring">
                      {t('sub.emptyBtn')}
                    </Link>
                  }
                >
                  {t('sub.emptyBody')}
                </EmptyState>
              )}
            </div>
          ) : (
            <>
              <p className="smallish muted mb-2">
                {plural('sub.count', rows.length, { n: rows.length })} · {t('sub.orderNote')}
              </p>
              {/* the server's order, untouched: the soonest charge is first and
                  anything with no charge coming is at the bottom */}
              <div className="d-grid gap-3">
                {rows.map((row) => (
                  <RenewalRow
                    key={row.ruleId}
                    row={row}
                    defaultWindow={defaultWindow}
                    onPause={pauseRow}
                    onResume={resumeRow}
                    onCancel={cancelRow}
                    onReminder={setReminder}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
