import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useLocale } from '../locale.jsx';
import { moneyInLedger } from '../money.js';
import { dayLabel } from '../dates.js';

/**
 * Compare Savings Options (ADV-3).
 *
 * The honest way to build a page like this is to be dull about it: this is a
 * transcription of what banks publish, kept in one table by administrators,
 * with a date on it. So the page leads with the disclaimer, shows the "as of"
 * date above the table, calls the "best rate" strip the highest published
 * figure rather than a winner, and never compares one person's situation to
 * another — there is nothing personal about a rate and nothing here is advice.
 *
 * API: GET /api/savings-options (public — the home page links here signed in
 * or not). The disclaimer sentence itself is `sav.disclaimer` in the
 * dictionary, so this page, the admin form and any print of this page all
 * read one string that cannot drift apart.
 */

/**
 * One breakpoint, read from the browser rather than added to the stylesheet.
 * Eight columns cannot be read on a 360px phone, so below this width the rows
 * become stacked cards and the page never scrolls sideways.
 */
function useNarrow(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event) => setNarrow(event.matches);
    setNarrow(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return narrow;
}

/** "11.5%" — the % sign is a symbol, not a word, so it stays untranslated. */
function rateText(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

export default function SavingsOptionsPage() {
  const { t, plural } = useLocale();
  const narrow = useNarrow();
  const [rows, setRows] = useState(null); // null = still loading
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const [type, setType] = useState(''); // '' = both product types
  const [search, setSearch] = useState('');

  // The bank search is a request, not a client-side filter, so the matching
  // happens in the database with the same aggregation the page reads. The
  // small debounce keeps a fast typist from asking once per letter.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        api
          .get(`/api/savings-options${qs({ accountType: type, bank: search.trim() })}`)
          .then((data) => {
            if (!live) return;
            setRows(data.rows || []);
            setSummary(data.summary || null);
            setError('');
          })
          .catch((err) => {
            if (live) setError(err.message);
          });
      },
      search ? 250 : 0
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [type, search]);

  const asOf = summary?.asOf ? dayLabel(summary.asOf) : '';
  const filtering = Boolean(type || search.trim());

  return (
    <Page
      trail={[{ label: t('sav.title') }]}
      title={t('sav.title')}
      subtitle={t('sav.subtitle')}
      actions={
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <Icon name="file" /> {t('sav.print')}
        </button>
      }
    >
      {/* Mandatory, permanent, and first on the page: nobody should ever be
          one scroll away from a rate with the warning left behind. */}
      <div className="card mb-3" role="note">
        <p className="mb-1 d-flex align-items-center gap-2">
          <Icon name="warning" /> <strong>{t('sav.disclaimerTitle')}</strong>
        </p>
        <p className="mb-0">{t('sav.disclaimer')}</p>
      </div>

      <p className="smallish muted">{t('sav.intro')}</p>

      <div className="d-grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="card">
          <div className="card-title">
            <span>{t('sav.bestSavings')}</span>
          </div>
          <p className="mb-0 num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {rateText(summary?.savings?.bestRate)}
          </p>
        </div>
        <div className="card">
          <div className="card-title">
            <span>{t('sav.bestFd')}</span>
          </div>
          <p className="mb-0 num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {rateText(summary?.fd?.bestRate)}
          </p>
        </div>
        <div className="card">
          <div className="card-title">
            <span>{t('sav.banks')}</span>
          </div>
          <p className="mb-0 num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {summary ? summary.banks : '—'}
          </p>
          <p className="smallish muted mb-0">
            {summary ? plural('sav.offers', summary.total, { n: summary.total }) : ' '}
          </p>
        </div>
      </div>
      <p className="smallish muted">{t('sav.summaryNote')}</p>

      <div className="card mb-3">
        <div className="d-flex gap-3 flex-wrap align-items-end">
          <div className="field" style={{ marginBottom: 0 }}>
            <span
              id="sav-type-label"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
            >
              {t('sav.show')}
            </span>
            <div className="chip-grid" role="group" aria-labelledby="sav-type-label">
              <button type="button" className="chip" aria-pressed={type === ''} onClick={() => setType('')}>
                {t('ui.all')}
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={type === 'savings'}
                onClick={() => setType('savings')}
              >
                {t('sav.savings')}
              </button>
              <button type="button" className="chip" aria-pressed={type === 'fd'} onClick={() => setType('fd')}>
                {t('sav.fd')}
              </button>
            </div>
          </div>

          <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
            <label htmlFor="sav-bank-search">{t('sav.bankSearch')}</label>
            <input
              id="sav-bank-search"
              className="input"
              type="search"
              value={search}
              placeholder={t('sav.bankSearchPlaceholder')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40 }} />
          <p className="smallish muted mb-0 mt-3">{t('ui.loading')}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="bank"
            title={filtering ? t('sav.noMatchTitle') : t('sav.emptyTitle')}
          >
            {filtering ? t('sav.noMatchBody') : t('sav.emptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <p className="smallish muted">{t('sav.asOf', { date: asOf || t('sav.asOfUnknown') })}</p>

          {narrow ? (
            /* Stacked cards. Every value gets its own labelled line, so nothing
               is hidden behind a horizontal scroll on a small phone. */
            <div className="card" style={{ padding: 0 }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {rows.map((row) => (
                  <li key={row.id} className="txn-row" style={{ display: 'block' }}>
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <strong>{row.bank}</strong>
                      <span className="num" style={{ fontWeight: 700 }}>
                        {rateText(row.ratePercent)}
                      </span>
                    </div>
                    <div className="d-flex gap-2 flex-wrap mt-2">
                      <span className="pill">{row.accountType === 'fd' ? t('sav.fd') : t('sav.savings')}</span>
                      {row.isBest && (
                        <span className="pill pill-suggest">
                          <Icon name="award" size={13} /> {t('sav.best')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="smallish mb-1">
                        <span className="muted">{t('sav.minimum')}:</span>{' '}
                        {row.minAmount === null ? t('sav.minimumNone') : moneyInLedger(row.minAmount)}
                      </p>
                      <p className="smallish mb-1">
                        <span className="muted">{t('sav.tenure')}:</span>{' '}
                        {row.tenureMonths === null
                          ? '—'
                          : plural('sav.months', row.tenureMonths, { n: row.tenureMonths })}
                      </p>
                      <p className="smallish mb-1">
                        <span className="muted">{t('sav.region')}:</span> {row.region || '—'}
                      </p>
                      <p className="smallish mb-1">
                        <span className="muted">{t('sav.note')}:</span> {row.note || '—'}
                      </p>
                      <p className="smallish mb-0">
                        <span className="muted">{t('sav.source')}:</span> {row.sourceNote || t('sav.sourceMissing')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-scroll">
                <table className="table">
                  <caption className="visually-hidden">{t('sav.caption')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('sav.bank')}</th>
                      <th scope="col">{t('ui.type')}</th>
                      <th scope="col">{t('sav.rate')}</th>
                      <th scope="col">{t('sav.minimum')}</th>
                      <th scope="col">{t('sav.tenure')}</th>
                      <th scope="col">{t('sav.region')}</th>
                      <th scope="col">{t('sav.note')}</th>
                      <th scope="col">{t('sav.source')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.bank}</strong>
                          {row.isBest && (
                            <span className="pill pill-suggest ms-2">
                              <Icon name="award" size={13} /> {t('sav.best')}
                            </span>
                          )}
                        </td>
                        <td>{row.accountType === 'fd' ? t('sav.fd') : t('sav.savings')}</td>
                        <td className="num">{rateText(row.ratePercent)}</td>
                        <td className="num">
                          {row.minAmount === null ? t('sav.minimumNone') : moneyInLedger(row.minAmount)}
                        </td>
                        <td>
                          {row.tenureMonths === null
                            ? '—'
                            : plural('sav.months', row.tenureMonths, { n: row.tenureMonths })}
                        </td>
                        <td>{row.region || '—'}</td>
                        <td className="smallish">{row.note || '—'}</td>
                        <td className="smallish">{row.sourceNote || t('sav.sourceMissing')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="smallish muted mt-2 mb-0">{t('sav.printNote')}</p>
        </>
      )}

      <div className="card mt-3">
        <div className="card-title">
          <span>
            <Icon name="bulb" /> {t('sav.learnTitle')}
          </span>
        </div>
        <p className="mb-2">{t('sav.whatIsFd')}</p>
        <p className="mb-2">{t('sav.minimumNote')}</p>
        <p className="mb-0">{t('sav.bankIsTruth')}</p>
      </div>
    </Page>
  );
}
