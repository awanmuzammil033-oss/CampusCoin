import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';

function monthTitle(key) {
  if (!key) return '';
  const [y, m] = String(key).slice(0, 7).split('-').map(Number);
  if (!y || !m) return String(key);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The server may hand back one shape or another; read either without drama. */
function readList(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.rows || payload?.insights || [];
}

function readOne(payload) {
  if (!payload) return null;
  if (payload.insight) return payload.insight;
  if (payload.row) return payload.row;
  if (Array.isArray(payload.rows)) return payload.rows[0] || null;
  if (payload.summaryText || payload.month) return payload;
  return null;
}

function readFlags(value) {
  let flags = value;
  if (typeof flags === 'string') {
    try {
      flags = JSON.parse(flags);
    } catch {
      flags = [];
    }
  }
  if (!Array.isArray(flags)) return [];
  return flags.map((flag) => {
    if (typeof flag === 'string') return { text: flag };
    const name = typeof flag.category === 'string' ? flag.category : flag.category?.name || flag.name || 'Category';
    const pct = flag.pct_change ?? flag.pctChange ?? flag.pct;
    const text = pct !== undefined && pct !== null ? `${name} ${Number(pct) >= 0 ? '↑' : '↓'}${Math.abs(Math.round(Number(pct)))}%` : name;
    return { text };
  });
}

function readForecast(payload) {
  const source = payload?.rows || payload?.forecast || payload?.estimates || (Array.isArray(payload) ? payload : []);
  if (!Array.isArray(source)) return [];
  return source.map((row) => ({
    name:
      (typeof row.category === 'string' ? row.category : row.category?.name) || row.name || 'Other',
    amount: Number(row.estimated ?? row.amount ?? row.total ?? 0),
  }));
}

/**
 * Monthly insights: a plain-language read of one month, the categories that
 * moved, one suggestion, and the standing disclaimer. Always advisory.
 */
export default function Insights() {
  const { push } = useToast();
  const [searchParams] = useSearchParams();
  const selectedMonth = searchParams.get('month') || '';

  const [rows, setRows] = useState(null);
  const [detail, setDetail] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [bookmarkFor, setBookmarkFor] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get('/api/insights')
      .then((payload) => alive && setRows(readList(payload)))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });

    api
      .get('/api/insights/forecast')
      .then((payload) => alive && setForecast(readForecast(payload)))
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [push]);

  useEffect(() => {
    if (!selectedMonth) {
      setDetail(undefined); // undefined = nothing requested, null = loading
      return undefined;
    }
    let alive = true;
    setDetail(null);
    api
      .get(`/api/insights/${selectedMonth}`)
      .then((payload) => alive && setDetail(readOne(payload)))
      .catch((err) => {
        if (alive) {
          setDetail(null);
          push(err.message, 'error');
        }
      });
    return () => {
      alive = false;
    };
  }, [selectedMonth, push]);

  async function generate() {
    setGenerating(true);
    try {
      const payload = await api.post('/api/insights/generate', {});
      const created = readOne(payload);
      if (created) {
        setRows((list) => [created, ...(list || []).filter((i) => i.month !== created.month)]);
        push('Summary ready.');
      } else {
        setRows(null);
        push('Summary ready.');
      }
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    try {
      const payload = await api.post(`/api/insights/${bookmarkFor.id}/bookmark`, { note });
      const updated = readOne(payload) || { ...bookmarkFor, note, isBookmarked: true };
      setRows((list) => (list || []).map((i) => (i.id === bookmarkFor.id ? { ...i, ...updated, note } : i)));
      if (detail?.id === bookmarkFor.id) setDetail((d) => ({ ...d, ...updated, note }));
      setBookmarkFor(null);
      push('Saved to your bookmarks.');
    } catch (err) {
      push(err.message, 'error');
    }
  }

  const currentMonth = monthKeyOf(new Date());
  const historyMonths = [...new Set((rows || []).map((r) => String(r.month || '').slice(0, 7)).filter(Boolean))];

  return (
    <Page
      trail={[
        { label: 'Insights' },
        ...(selectedMonth ? [{ label: monthTitle(selectedMonth) }] : []),
      ]}
      title="Insights"
      subtitle="A short, honest read of each month — generated from your own entries."
      actions={
        <button type="button" className="btn btn-primary" onClick={generate} disabled={generating}>
          {generating && <span className="spinner" aria-hidden="true" />}
          {generating ? 'Working…' : `Generate for ${monthTitle(currentMonth)}`}
        </button>
      }
    >
      <div role="status" aria-live="polite" className="mb-3">
        {generating && (
          <span className="d-inline-flex align-items-center gap-2 muted">
            <span className="spinner" aria-hidden="true" />
            Crunching your numbers…
          </span>
        )}
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {historyMonths.length > 0 && (
        <nav className="d-flex gap-2 flex-wrap align-items-center mb-3" aria-label="Insight history">
          <span className="smallish muted">History:</span>
          <Link className="chip" aria-current={selectedMonth ? undefined : 'page'} to="/insights">
            All
          </Link>
          {historyMonths.map((ym) => (
            <Link
              key={ym}
              className="chip"
              aria-current={selectedMonth === ym ? 'page' : undefined}
              to={`/insights?month=${ym}`}
            >
              {monthTitle(ym).split(' ')[0]} {ym.slice(2, 4)}
            </Link>
          ))}
        </nav>
      )}

      {/* one month opened from the history row */}
      {selectedMonth && (
        <div className="mb-4">
          {detail === null && (
            <div className="card" role="status">
              <div className="skeleton" style={{ height: 20, width: '35%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '70%' }} />
              <p className="smallish muted mb-0 mt-3">Opening {monthTitle(selectedMonth)}…</p>
            </div>
          )}
          {detail !== null && !detail && (
            <div className="card">
              <EmptyState icon="🌤️" title="No insight for that month">
                Nothing was generated for {monthTitle(selectedMonth)} — try another month from the history row.
              </EmptyState>
            </div>
          )}
          {detail && <InsightCard insight={detail} onBookmark={(i) => { setBookmarkFor(i); setNote(i.note || ''); }} />}
        </div>
      )}

      {/* the running list */}
      {!selectedMonth && (
        <>
          {!rows && !error && (
            <div className="card" role="status">
              <div className="skeleton" style={{ height: 24, width: '30%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '60%' }} />
              <p className="smallish muted mb-0 mt-3">Loading your insights…</p>
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="card">
              <EmptyState
                icon="🌤️"
                title="No insights yet"
                action={
                  <button type="button" className="btn btn-primary mt-2" onClick={generate} disabled={generating}>
                    {generating ? 'Crunching your numbers…' : `Generate for ${monthTitle(currentMonth)}`}
                  </button>
                }
              >
                One press writes a short summary of your month — categories that grew, and one thing to try.
              </EmptyState>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="d-grid gap-3">
              {rows.map((insight) => (
                <InsightCard
                  key={insight.id || insight.month}
                  insight={insight}
                  onBookmark={(i) => {
                    setBookmarkFor(i);
                    setNote(i.note || '');
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <section className="card mt-4">
        <div className="card-title">
          <span>Next month estimate</span>
          <span className="pill">Estimate</span>
        </div>
        {forecast.length === 0 ? (
          <p className="muted mb-0 smallish">
            Once a few months are logged, next month's rough numbers show up here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="d-grid gap-2">
            {forecast.map((row) => (
              <li key={row.name}>
                <div className="d-flex justify-content-between smallish mb-1">
                  <span>{row.name}</span>
                  <span className="num">
                    {row.amount < 0 ? '−' : ''}${Math.abs(row.amount).toFixed(2)}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.max(4, Math.round((row.amount / Math.max(...forecast.map((f) => f.amount), 1)) * 100))}%`,
                      background: 'var(--cc-chart-4)',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="smallish muted mb-0 mt-2">
          A weighted look at the last three months plus anything recurring — an estimate, not a promise.
        </p>
      </section>

      {bookmarkFor && (
        <Modal
          title="Bookmark note"
          onClose={() => setBookmarkFor(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setBookmarkFor(null)}>
                Cancel
              </button>
              <button type="submit" form="insight-note-form" className="btn btn-primary">
                Save note
              </button>
            </>
          }
        >
          <form id="insight-note-form" onSubmit={saveNote}>
            <p className="smallish muted">Optional — only you ever see it.</p>
            <FormField label="Your note" htmlFor="insight-note">
              {(a) => (
                <textarea
                  id="insight-note"
                  className="input"
                  rows={4}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}
    </Page>
  );
}

/** One month: narrative, flags, the suggestion, and its disclaimer. */
function InsightCard({ insight, onBookmark }) {
  const ym = String(insight.month || '').slice(0, 7);
  const flags = readFlags(insight.flags);

  return (
    <article className="card">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <h2 className="mb-0">{monthTitle(ym) || 'Insight'}</h2>
        <span className="d-flex gap-2 align-items-center">
          {insight.isBookmarked && <span className="pill">🔖 Bookmarked</span>}
          <Link className="btn btn-ghost btn-sm" to={`/insights?month=${ym}`}>
            Open month
          </Link>
        </span>
      </div>

      <p className="smallish muted mb-1">Generated summary</p>
      <p>{insight.summaryText || 'Nothing notable about this month.'}</p>

      {flags.length > 0 && (
        <div className="d-flex gap-2 flex-wrap mb-2" role="list" aria-label="Categories that moved">
          {flags.map((flag, i) => (
            <span className="pill pill-expense" role="listitem" key={`${flag.text}-${i}`}>
              {flag.text}
            </span>
          ))}
        </div>
      )}

      {insight.tipText && (
        <p className="mb-2">
          <strong>Try:</strong> {insight.tipText}
        </p>
      )}

      <p className="smallish muted mb-3">
        <span aria-hidden="true">ℹ️</span> Suggestions only — not financial advice.
      </p>

      <div className="d-flex gap-2 flex-wrap">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onBookmark(insight)}>
          {insight.isBookmarked ? 'Bookmarked ✓ · edit note' : '🔖 Bookmark'}
        </button>
      </div>
    </article>
  );
}
