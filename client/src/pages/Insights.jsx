import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

function monthTitle(key) {
  if (!key) return '';
  const [y, m] = String(key).slice(0, 7).split('-').map(Number);
  if (!y || !m) return String(key);
  return new Date(y, m - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
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

function readFlags(value, t) {
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
    if (typeof flag === 'string') return { text: flag, dir: null };
    const name = typeof flag.category === 'string' ? flag.category : flag.category?.name || flag.name || t('ui.category');
    const pct = flag.pct_change ?? flag.pctChange ?? flag.pct;
    // The direction rides along as an icon name so the arrow is drawn, not typed.
    if (pct === undefined || pct === null) return { text: name, dir: null };
    const up = Number(pct) >= 0;
    return { text: `${name} ${Math.abs(Math.round(Number(pct)))}%`, dir: up ? 'trendUp' : 'trendDown' };
  });
}

function readForecast(payload, t) {
  const source = payload?.rows || payload?.forecast || payload?.estimates || (Array.isArray(payload) ? payload : []);
  if (!Array.isArray(source)) return [];
  return source.map((row) => ({
    name:
      (typeof row.category === 'string' ? row.category : row.category?.name) || row.name || t('rep.other'),
    amount: Number(row.estimated ?? row.amount ?? row.total ?? 0),
  }));
}

/**
 * Monthly insights: a plain-language read of one month, the categories that
 * moved, one suggestion, and the standing disclaimer. Always advisory.
 */
export default function Insights() {
  const { t } = useLocale();
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
      .then((payload) => alive && setForecast(readForecast(payload, t)))
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
        push(t('ins.ready'));
      } else {
        setRows(null);
        push(t('ins.ready'));
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
      push(t('ins.savedNote'));
    } catch (err) {
      push(err.message, 'error');
    }
  }

  const currentMonth = monthKeyOf(new Date());
  const historyMonths = [...new Set((rows || []).map((r) => String(r.month || '').slice(0, 7)).filter(Boolean))];

  return (
    <Page
      loading={!rows && !error}
      trail={[
        { label: t('nav.insights') },
        ...(selectedMonth ? [{ label: monthTitle(selectedMonth) }] : []),
      ]}
      title={t('nav.insights')}
      subtitle={t('ins.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={generate} disabled={generating}>
          {generating && <span className="spinner" aria-hidden="true" />}
          {generating ? t('ui.working') : t('ins.generateFor', { month: monthTitle(currentMonth) })}
        </button>
      }
    >
      <div role="status" aria-live="polite" className="mb-3">
        {generating && (
          <span className="d-inline-flex align-items-center gap-2 muted">
            <span className="spinner" aria-hidden="true" />
            {t('ins.crunching')}
          </span>
        )}
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {historyMonths.length > 0 && (
        <nav className="d-flex gap-2 flex-wrap align-items-center mb-3" aria-label={t('ins.historyAria')}>
          <span className="smallish muted">{t('ins.historyLabel')}</span>
          <Link className="chip" aria-current={selectedMonth ? undefined : 'page'} to="/insights">
            {t('ui.all')}
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
              <p className="smallish muted mb-0 mt-3">{t('ins.opening', { month: monthTitle(selectedMonth) })}</p>
            </div>
          )}
          {detail !== null && !detail && (
            <div className="card">
              <EmptyState icon="sparkles" title={t('ins.noInsightTitle')}>
                {t('ins.noInsightBody', { month: monthTitle(selectedMonth) })}
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
              <p className="smallish muted mb-0 mt-3">{t('ins.loading')}</p>
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="card">
              <EmptyState
                icon="sparkles"
                title={t('ins.emptyTitle')}
                action={
                  <button type="button" className="btn btn-primary mt-2" onClick={generate} disabled={generating}>
                    {generating ? t('ins.crunching') : t('ins.generateFor', { month: monthTitle(currentMonth) })}
                  </button>
                }
              >
                {t('ins.emptyBody')}
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
          <span>{t('ins.forecastTitle')}</span>
          <span className="pill">{t('ins.estimatePill')}</span>
        </div>
        {forecast.length === 0 ? (
          <p className="muted mb-0 smallish">
            {t('ins.forecastEmpty')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="d-grid gap-2">
            {forecast.map((row) => (
              <li key={row.name}>
                <div className="d-flex justify-content-between smallish mb-1">
                  <span>{row.name}</span>
                  <span className="num">
                    {money(row.amount)}
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
          {t('ins.forecastNote')}
        </p>
      </section>

      {bookmarkFor && (
        <Modal
          title={t('ins.noteTitle')}
          onClose={() => setBookmarkFor(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setBookmarkFor(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="insight-note-form" className="btn btn-primary">
                {t('ui.saveNote')}
              </button>
            </>
          }
        >
          <form id="insight-note-form" onSubmit={saveNote}>
            <p className="smallish muted">{t('ins.noteOptional')}</p>
            <FormField label={t('ins.yourNote')} htmlFor="insight-note">
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
  const { t } = useLocale();
  const ym = String(insight.month || '').slice(0, 7);
  const flags = readFlags(insight.flags, t);

  return (
    <article className="card">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <h2 className="mb-0">{monthTitle(ym) || t('ins.insightWord')}</h2>
        <span className="d-flex gap-2 align-items-center">
          {insight.isBookmarked && (
            <span className="pill"><Icon name="bookmark" size={14} /> {t('ins.bookmarkedPill')}</span>
          )}
          <Link className="btn btn-ghost btn-sm" to={`/insights?month=${ym}`}>
            {t('ins.openMonth')}
          </Link>
        </span>
      </div>

      <p className="smallish muted mb-1">{t('ins.generatedSummary')}</p>
      <p>{insight.summaryText || t('ins.nothingNotable')}</p>

      {flags.length > 0 && (
        <div className="d-flex gap-2 flex-wrap mb-2" role="list" aria-label={t('ins.movedAria')}>
          {flags.map((flag, i) => (
            <span className="pill pill-expense" role="listitem" key={`${flag.text}-${i}`}>
              {flag.dir && <Icon name={flag.dir} />} {flag.text}
            </span>
          ))}
        </div>
      )}

      {insight.tipText && (
        <p className="mb-2">
          <strong>{t('ins.tryLabel')}</strong> {insight.tipText}
        </p>
      )}

      <p className="smallish muted mb-3">
        <Icon name="info" /> {t('ui.suggestionsOnly')}
      </p>

      <div className="d-flex gap-2 flex-wrap">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onBookmark(insight)}>
          <Icon name={insight.isBookmarked ? 'pencil' : 'bookmark'} size={15} />
          {' '}{insight.isBookmarked ? t('ins.bookmarkEdit') : t('ins.bookmarkBtn')}
        </button>
      </div>
    </article>
  );
}
