import { useEffect, useState } from 'react';

import { api, qs } from '../api.js';
import { moneyInLedger } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel, uiLang } from '../dates.js';

/**
 * The spending calendar: one month, shaded by day.
 *
 * WHERE IT GOES
 *
 * The `daily` tab of the reports page, under that tab's heading and above the
 * daily line chart. The two answer different questions about the same month -
 * the chart shows the shape of a trend, the calendar shows *which days* - so the
 * calendar leads, and both are read together rather than one instead of the
 * other. The month follows the page's own arrows, so the card never carries a
 * second month picker that could disagree with them.
 *
 * A GRID, NOT A LIST
 *
 * Seven columns, one row per week, Monday first - the same Monday-first weeks
 * the daily report already labels, so a reader moving between the two is not
 * re-learning which way round the week runs. Days outside the month are drawn as
 * empty cells rather than left out, because a grid whose cells move when you page
 * from one month to the next is a grid nobody can learn to read.
 *
 * WHY QUANTILE BANDS, AND WHY THE LEGEND PRINTS THE EDGES
 *
 * A shading scale that splits the month's maximum into four equal ranges makes
 * an ordinary month look flat and a single huge day overflow the top of the
 * scale. So the server cut the month at its quartiles and sends back where they
 * are, and this file prints them. "Darker is more" is a picture; "darker is
 * more, and the edges are 240, 610 and 900" is a scale somebody can check.
 *
 * WHY A DAY OPENS A PANEL INSTEAD OF A LINK
 *
 * The transactions page keeps its from/to filters in component state rather than
 * in the URL, so a link to `/transactions?from=…&to=…` would land on the
 * unfiltered ledger: a link that looks filtered and is not. Rather than teach the
 * grid to lie about where it is going, clicking a day asks the SAME
 * `/api/transactions` endpoint the transactions page itself asks, with that day
 * as its range. The rows are the app's own ledger rows through the app's own
 * service, so the day has no second list and no second answer to disagree with.
 *
 * THE ONE RULE OF THIS FILE
 *
 * The server sends FACTS and the dictionary writes the words. Every figure here
 * is printed exactly as it arrived - nothing is summed, averaged or converted
 * in the browser - and every string goes through `t()`.
 *
 * MONEY IS IN THE LEDGER CURRENCY HERE, AND SAYS SO
 *
 * The bands are cut in the currency the amounts are STORED in, so the edges in
 * the legend are ledger amounts. Printing those edges in the display currency
 * would put two different units in one sentence and the legend would be wrong
 * by a rate nobody could see. So the whole card is `moneyInLedger()` and the
 * note under the legend names the currency the server sent. This is the one
 * place in the app that deliberately does NOT follow the display picker.
 */

/* The five bands, in order. The names are what a reader with no colour vision at
 * all is left with, which is why they exist rather than being implied by a tint. */
const BAND_LABEL = ['heat.bandEmpty', 'heat.band1', 'heat.band2', 'heat.band3', 'heat.band4'];

const WEEKDAY_FORMAT = { weekday: 'short' };

export default function SpendingHeatmap({ month, className = '' }) {
  const { t, plural } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Which day is open in the panel, and what the ledger had to say about it.
  const [open, setOpen] = useState(null);
  const [dayRows, setDayRows] = useState(null);
  const [dayTotal, setDayTotal] = useState(0);
  const [dayShown, setDayShown] = useState(0);
  const [dayAll, setDayAll] = useState(0);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .get(`/api/heatmap${qs({ month })}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [month, reloadKey]);

  /*
   * The day's rows come from the ledger endpoint the transactions page itself
   * calls, filtered to that one day - not from a second query written for the
   * heatmap. A day with nothing on it is not asked for at all: the server has
   * already said the count is zero, and a request that can only come back empty
   * is a request whose answer could disagree with the cell it sits beside.
   */
  useEffect(() => {
    if (!open) return undefined;
    const cell = open;
    if (!cell.count) {
      setDayRows([]);
      setDayTotal(0);
      setDayShown(0);
      setDayAll(0);
      setDayLoading(false);
      setDayError('');
      return undefined;
    }
    let alive = true;
    setDayLoading(true);
    api
      .get(`/api/transactions${qs({ from: cell.date, to: cell.date, type: 'expense', perPage: 100 })}`)
      .then((res) => {
        if (!alive) return;
        const rows = Array.isArray(res?.rows) ? res.rows : [];
        setDayRows(rows);
        // The server's own total for that filter, not a sum of the rows: the
        // page header totals are computed over every matching row while the
        // list shows the newest 100, and adding those 100 up here would be a
        // second figure for a day that already has one.
        setDayTotal(Number(res?.totals?.expense ?? 0));
        // The list is capped, so a day with more entries than the cap has them is
        // SAID to, rather than quietly showing a shorter list that looks whole.
        setDayShown(rows.length);
        setDayAll(Number(res?.pagination?.total ?? rows.length));
        setDayError('');
      })
      .catch((err) => {
        if (!alive) return;
        setDayRows(null);
        setDayError(err.message);
      })
      .finally(() => {
        if (alive) setDayLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function toggleDay(cell) {
    setOpen((current) => (current && current.date === cell.date ? null : cell));
  }

  const days = Array.isArray(data?.grid?.days) ? data.grid.days : [];
  const weeks = Number(data?.grid?.weeks ?? 0);
  const scale = data?.scale ?? { min: 0, max: 0, breakpoints: [], defined: false };
  const totals = data?.totals ?? { monthSpend: 0, daysWithSpend: 0, busiest: null, averageOfDaysWithSpend: null };
  const edges = Array.isArray(scale.breakpoints) ? scale.breakpoints : [];
  const spendDays = Number(totals.daysWithSpend) || 0;

  /* Rows are cut here rather than in the server, because a grid is a shape and
   * the shape is the whole point: the server sends one flat list of cells and
   * the seven-column rows are a property of the calendar, not of the data. */
  const rows = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

  const isEmpty = !loading && !error && spendDays === 0;
  const panelOpen = open && open.inMonth;

  return (
    <section className={`cc-heat${className ? ` ${className}` : ''}`} aria-labelledby="cc-heat-title" aria-busy={loading}>
      <div className="cc-heat-head">
        <h2 id="cc-heat-title" className="cc-heat-title mb-0">
          {t('heat.title')}
        </h2>
        {data?.month && <span className="cc-heat-month num">{monthWords(data.month)}</span>}
        <button type="button" className="btn btn-ghost btn-sm ms-auto" onClick={refresh}>
          {t('heat.refresh')}
        </button>
      </div>

      {error && (
        <div className="cc-heat-error field-error" role="alert">
          <p className="mb-1" style={{ fontWeight: 600 }}>
            {t('heat.errorTitle')}
          </p>
          {/* the server's own sentence, not a friendlier invention of one */}
          <p className="smallish mb-2">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            {t('heat.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="cc-heat-loading" role="status">
          <span className="skeleton" style={{ display: 'block', height: 120 }} />
          <p className="smallish muted mb-0 mt-2">{t('heat.loading')}</p>
        </div>
      )}

      {isEmpty && (
        <div className="cc-heat-empty">
          <p className="mb-1" style={{ fontWeight: 600 }}>
            {t('heat.emptyTitle', { month: monthWords(data?.month || month) })}
          </p>
          <p className="smallish muted mb-0">{t('heat.emptyBody')}</p>
        </div>
      )}

      {!loading && !error && !isEmpty && (
        <div className="cc-heat-layout">
          <div className="cc-heat-calendar">
            <table className="cc-heat-grid">
              <caption className="visually-hidden">{t('heat.gridCaption', { month: monthWords(data?.month) })}</caption>
              <thead className="cc-heat-weekdays">
                <tr>
                  {weekdayNames().map((name, i) => (
                    <th key={i} scope="col" className="cc-heat-weekday">
                      <span aria-hidden="true">{name}</span>
                      <span className="visually-hidden">{fullWeekdayName(i)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((cell) => (
                      <td
                        key={cell.date ?? `pad-${wi}-${cell.weekday}`}
                        className={`cc-heat-cell${cell.inMonth ? ` cc-heat-b${cell.bucket}` : ' cc-heat-cell-out'}`}
                      >
                        {cell.inMonth ? (
                          <button
                            type="button"
                            className={`cc-heat-day${open && open.date === cell.date ? ' is-open' : ''}`}
                            onClick={() => toggleDay(cell)}
                            aria-expanded={Boolean(open && open.date === cell.date)}
                            aria-controls="cc-heat-panel"
                            aria-label={plural('heat.cellAria', cell.count, cellAriaParts(cell))}
                          >
                            <span className="cc-heat-daynum" aria-hidden="true">
                              {Number(cell.date.slice(8, 10))}
                            </span>
                            {/* The glyph on the top band is not decoration: the
                                tint is the summary and this is the figure, so a
                                reader who cannot see the shading loses nothing,
                                and the dearest day is marked three ways. */}
                            {cell.bucket === 4 && <span className="cc-heat-mark" aria-hidden="true">🔥</span>}
                            {cell.spend > 0 && (
                              <span className="cc-heat-amount num" aria-hidden="true">
                                {moneyInLedger(cell.spend)}
                              </span>
                            )}
                          </button>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="cc-heat-note smallish muted">
              {scale.defined
                ? t('heat.scaleNote', {
                    days: spendDays,
                    min: moneyInLedger(scale.min),
                    max: moneyInLedger(scale.max),
                    currency: data?.currency || '',
                  })
                : t(spendDays === 1 ? 'heat.scaleOneDay' : 'heat.scaleNone')}
            </p>

            <div className="cc-heat-legend" role="group" aria-label={t('heat.legend')}>
              {[1, 2, 3, 4].map((band) => (
                <div className="cc-heat-legend-item" key={band}>
                  <span className={`cc-heat-legend-swatch cc-heat-b${band}`} aria-hidden="true" />
                  <span className="cc-heat-legend-text smallish">
                    <strong>{t(BAND_LABEL[band])}</strong>{' '}
                    {bandLabelText(band, edges, t, moneyInLedger)}
                  </span>
                </div>
              ))}
              <div className="cc-heat-legend-item">
                <span className="cc-heat-legend-swatch cc-heat-b0" aria-hidden="true" />
                <span className="cc-heat-legend-text smallish">
                  <strong>{t(BAND_LABEL[0])}</strong> {t('heat.bandEmptyRange')}
                </span>
              </div>
            </div>

            <dl className="cc-heat-totals">
              <div className="cc-heat-total">
                <dt className="smallish muted">{t('heat.totalMonth')}</dt>
                <dd className="num mb-0">{moneyInLedger(totals.monthSpend)}</dd>
              </div>
              <div className="cc-heat-total">
                <dt className="smallish muted">{t('heat.totalDays')}</dt>
                <dd className="num mb-0">{plural('heat.days', spendDays, { count: spendDays })}</dd>
              </div>
              {totals.busiest && (
                <div className="cc-heat-total">
                  <dt className="smallish muted">{t('heat.totalBusiest')}</dt>
                  <dd className="num mb-0">
                    {dayLabel(totals.busiest.date)} · {moneyInLedger(totals.busiest.amount)}
                  </dd>
                </div>
              )}
              {totals.averageOfDaysWithSpend !== null && totals.averageOfDaysWithSpend !== undefined && (
                <div className="cc-heat-total">
                  <dt className="smallish muted">{t('heat.totalAverage')}</dt>
                  <dd className="num mb-0">{moneyInLedger(totals.averageOfDaysWithSpend)}</dd>
                </div>
              )}
            </dl>
          </div>

          {panelOpen && (
            <div className="cc-heat-panel" id="cc-heat-panel" aria-label={t('heat.panelTitle', { date: dayLabel(panelOpen.date) })}>
              <div className="cc-heat-panel-head">
                <h3 className="mb-0">{dayLabel(panelOpen.date)}</h3>
                <button type="button" className="btn btn-ghost btn-sm ms-auto" onClick={() => setOpen(null)}>
                  {t('heat.close')}
                </button>
              </div>

              {dayLoading && <p className="smallish muted">{t('heat.panelLoading')}</p>}

              {dayError && (
                <p className="field-error smallish" role="alert">
                  {/* the server's own sentence, not a friendlier invention */}
                  <strong>{t('heat.panelError')}</strong> {dayError}
                </p>
              )}

              {!dayLoading && !dayError && dayRows && dayRows.length === 0 && (
                <p className="cc-heat-panel-empty smallish muted">{t('heat.panelEmpty')}</p>
              )}

              {!dayLoading && !dayError && dayRows && dayRows.length > 0 && (
                <>
                  <p className="cc-heat-panel-total num smallish">
                    {t('heat.panelTotal', { amount: moneyInLedger(dayTotal) })}
                  </p>
                  <ul className="cc-heat-panel-list list-unstyled mb-0">
                    {dayRows.map((row) => (
                      <li className="cc-heat-panel-row" key={row.id}>
                        <span className="cc-heat-panel-name">
                          {row.description || t('heat.entry')}
                          {row.category?.name ? <span className="muted smallish"> · {row.category.name}</span> : null}
                        </span>
                        <span className="cc-heat-panel-amount num">{moneyInLedger(row.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  {dayAll > dayShown && (
                    <p className="cc-heat-panel-total smallish muted mb-0">
                      {t('heat.panelTruncated', { shown: dayShown, total: dayAll })}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* --------------------------------- helpers ---------------------------------- */

/** "2026-09" as "September 2026", in the interface's own language. */
function monthWords(key) {
  const [y, m] = String(key || '').slice(0, 7).split('-').map(Number);
  if (!y || !m) return '';
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

/**
 * The seven column headings, in the interface's language.
 *
 * These are date words, the same kind of thing `dayLabel()` and `monthLabel()`
 * already format with the platform's own calendar rules, and a week that starts
 * on a different day in a different language is a real difference rather than a
 * translation to argue about. The full weekday name sits beside each short one
 * for a screen reader, and each day's own accessible name is built from its
 * date - so the columns are a convenience and never the only way to tell which
 * day a cell is.
 */
function weekdayNames() {
  // 2026-09-07 is a Monday, so column 0 of the server's grid is this date's
  // weekday. One known Monday, formatted seven times.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 7 + i));
    return d.toLocaleDateString(uiLang(), WEEKDAY_FORMAT);
  });
}

function fullWeekdayName(column) {
  return new Date(Date.UTC(2026, 8, 7 + column)).toLocaleDateString(uiLang(), { weekday: 'long' });
}

/** What a day button announces: the date, the figure, and how many entries. */
function cellAriaParts(cell) {
  return { date: dayLabel(cell.date), amount: moneyInLedger(cell.spend), count: cell.count };
}

/**
 * The printed range for one band, from the edges the server sent.
 *
 * Nothing here is derived: the numbers are the breakpoints exactly as they
 * arrived, and the words that join them are dictionary keys. Band 1 runs up to
 * the first edge, the middle bands run between two, and the top band is
 * everything above the last - which is the honest description of a quantile
 * scale, where the dearest day is by definition past the top edge.
 */
function bandLabelText(band, edges, t, format) {
  const at = (i) => format(edges[i]);
  if (band === 1) return t('heat.band1Range', { amount: at(0) });
  if (band === 4) return t('heat.band4Range', { amount: at(2) });
  return t('heat.bandRange', { from: at(band - 2), to: at(band - 1) });
}
