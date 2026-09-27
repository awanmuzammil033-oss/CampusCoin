import { useEffect, useState } from 'react';

import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import { api, qs } from '../api.js';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

/**
 * The spending-insights card.
 *
 * It sits under the transactions page's filters and says three things about one
 * month: where the money went, what stands out in the pattern of it, and what
 * those numbers are based on. It is the only card on that screen that is about
 * a month the student is not currently living in - the month list is asked for
 * first and the newest month that actually has entries in it is the one opened,
 * because a card about an empty month is an empty card, and somebody opening
 * the app should see last month, not a "no data" panel.
 *
 * THE RULE OF THIS FILE: the server sends FACTS and the dictionary writes the
 * words. `/api/insights/spending` returns ids, totals, counts and shares, and
 * never a sentence, so `sentenceOf()` below is the only place a pattern becomes
 * prose - and it is a dictionary key with placeholders, not a template string.
 * That is the whole reason this card can exist in fourteen languages and mean
 * the same thing in all of them.
 *
 * A `basis` of `home_cooked` or `weekend` means the number came from planning
 * arithmetic rather than from a measurement, so those two lines are labelled
 * "Tip:" and are the two the foot line explains. The other two are measurements
 * and are labelled "Insight:".
 */

const CARD_STYLE = {
  // Dark-theme first, and still right in the light one: the gradient runs from
  // the primary tint through the plain surface into a warm accent corner, and
  // the glow is the primary colour at 45% - a bright halo on the dark theme, a
  // soft deep shadow on the light one. Only --cc-* tokens, so the theme switch
  // moves every part of it and no colour is hard-coded anywhere.
  background:
    'linear-gradient(140deg, var(--cc-primary-soft) 0%, var(--cc-surface) 58%, var(--cc-accent-soft) 100%)',
  boxShadow:
    '0 0 0 1px var(--cc-border), 0 18px 44px -20px color-mix(in srgb, var(--cc-primary) 45%, transparent)',
};

const HEAD_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  marginBottom: 14,
};

const CONTROLS_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginLeft: 'auto',
  minWidth: 0,
};

const LABEL_STYLE = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--cc-muted)',
};

const FOOT_STYLE = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: '1px solid var(--cc-border)',
  display: 'grid',
  gap: 4,
};

/** The two bases that carry planning arithmetic rather than a measurement. */
const TIP_BASES = new Set(['home_cooked', 'weekend']);

/** The app's own glyph for each pattern, so the list scans before it is read. */
const GLYPH = {
  dining_out: 'burger',
  many_small: 'coins',
  weekend: 'pizza',
  idle_subscriptions: 'film',
};

/** "2026-09" as "September 2026" - the same shape the insights page uses. */
function monthWords(key) {
  const [y, m] = String(key || '').slice(0, 7).split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

/** A share as a whole percentage: 0.4212 -> "42%". */
function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

/**
 * One pattern in, one sentence out.
 *
 * Every branch is a dictionary key, and every number in the sentence is passed
 * in as a placeholder - `money()` for the figures so they come out in the
 * display currency, `percent()` for the one share that is spoken as a
 * percentage. An id with no branch returns '' and the pattern is left out
 * rather than rendered as a number with no words around it.
 */
function sentenceOf(pattern, t) {
  const amount = money(pattern.total);
  switch (pattern.id) {
    case 'dining_out':
      return t('insights.p.dining_out', {
        amount,
        count: pattern.count,
        saving: money(pattern.saving),
      });
    case 'many_small':
      return t('insights.p.many_small', {
        category: pattern.category || '—',
        count: pattern.count,
        amount,
        average: money(pattern.average),
      });
    case 'weekend':
      return t('insights.p.weekend', {
        percent: percent(pattern.share),
        amount,
        count: pattern.count,
      });
    case 'idle_subscriptions':
      return t('insights.p.idle_subscriptions', { count: pattern.count, amount });
    default:
      return '';
  }
}

export default function SpendingInsightsCard({ className = '' }) {
  const { t, plural } = useLocale();
  const [months, setMonths] = useState([]);
  const [month, setMonth] = useState(null); // null = the month list has not answered yet
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  /*
   * The month list first. It is not decoration: it is what decides WHICH month
   * the card opens on, and the answer is the newest month that has entries in
   * it rather than the server's "last month" default. A pick the student has
   * already made is kept as long as the list still offers it, so a refresh that
   * brings a new month in does not throw their choice away.
   */
  useEffect(() => {
    let alive = true;
    api
      .get('/api/insights/spending/months')
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.months) ? res.months.filter((row) => row?.month) : [];
        setMonths(list);
        setMonth((current) => {
          if (list.length === 0) return current ?? '';
          if (current && list.some((row) => row.month === current)) return current;
          return list[0].month;
        });
      })
      .catch(() => {
        // The list is a convenience. If it cannot be read the card still asks
        // the server for its own default month rather than sitting empty.
        if (alive) setMonth((current) => current ?? '');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (month === null) return undefined; // waiting for the list to say which month
    let alive = true;
    setLoading(true);
    api
      .get(`/api/insights/spending${qs({ month })}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setData(null);
        setError(err.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [month, reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  const totals = data?.totals || { count: 0 };
  const count = Number(totals.count) || 0;
  const top = Array.isArray(data?.top) ? data.top : [];
  const words = monthWords(data?.month || month);
  const isEmpty = !loading && !error && count === 0;

  /* The analysis line: the two biggest categories, in the display currency. */
  let analysis = '';
  if (top.length === 1) {
    analysis = t('insights.analysisOne', { category: top[0].name || '—', amount: money(top[0].total) });
  } else if (top.length > 1) {
    analysis = t('insights.analysisTwo', {
      category: top[0].name || '—',
      amount: money(top[0].total),
      nextCategory: top[1].name || '—',
      nextAmount: money(top[1].total),
    });
  } else {
    analysis = t('insights.analysisNone', { month: words || '—' });
  }

  /* The bullets, in the order the server sent them, each with its label. */
  const bullets = (data?.patterns || [])
    .map((pattern) => ({
      id: pattern.id,
      text: sentenceOf(pattern, t),
      tip: TIP_BASES.has(pattern.basis),
      glyph: GLYPH[pattern.id] || 'info',
    }))
    .filter((row) => row.text);

  /*
   * The two estimates, and only the ones a bullet above actually used. The
   * percentages come from the server (`estimates`), not from a constant in the
   * client, so the numbers on screen are the numbers the tests assert on.
   */
  const estimateNotes = [];
  if (bullets.some((row) => row.id === 'dining_out')) {
    estimateNotes.push(t('insights.estimateFood', { percent: percent(data?.estimates?.homeCooked) }));
  }
  if (bullets.some((row) => row.id === 'weekend')) {
    estimateNotes.push(t('insights.estimateWeekend', { threshold: percent(data?.estimates?.weekendLook) }));
  }

  return (
    <section
      className={`card cc-insights${className ? ` ${className}` : ''}`}
      style={CARD_STYLE}
      aria-labelledby="cc-insights-title"
      aria-busy={loading}
    >
      <div className="cc-insights-head" style={HEAD_STYLE}>
        {/* the ✨, drawn by the app's own Icon component so it keeps the same
            sizing and theming rules as every other glyph in the product */}
        <span aria-hidden="true" style={{ display: 'inline-flex' }}>
          <Icon name="sparkles" size={20} />
        </span>
        <h2 id="cc-insights-title" className="mb-0" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
          {t('insights.title')}
        </h2>
        {words && <span className="smallish muted">{words}</span>}

        <div className="cc-insights-controls" style={CONTROLS_STYLE}>
          {months.length > 0 && (
            <>
              <label className="visually-hidden" htmlFor="cc-insights-month">
                {t('insights.month')}
              </label>
              <select
                id="cc-insights-month"
                className="input"
                value={month || ''}
                onChange={(event) => setMonth(event.target.value)}
                style={{ width: 'auto', maxWidth: '100%', minHeight: 36, padding: '4px 10px', fontSize: '0.875rem' }}
              >
                {months.map((row) => (
                  <option key={row.month} value={row.month}>
                    {monthWords(row.month)}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
            <Icon name="repeat" size={15} /> {t('insights.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="cc-insights-error" role="alert">
          <p className="mb-1" style={{ fontWeight: 600 }}>
            <Icon name="warning" size={15} /> {t('insights.errorTitle')}
          </p>
          {/* the server's own sentence, not a friendlier invention of one */}
          <p className="smallish mb-2">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            {t('insights.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="cc-insights-loading" role="status">
          <span className="skeleton" style={{ display: 'block', height: 18, marginBottom: 10 }} />
          <span className="skeleton" style={{ display: 'block', height: 18, marginBottom: 10 }} />
          <span className="skeleton" style={{ display: 'block', height: 18 }} />
          <p className="smallish muted mb-0" style={{ marginTop: 12 }}>
            {t('ui.loading')}
          </p>
        </div>
      )}

      {isEmpty && (
        <EmptyState icon="chart" title={t('insights.emptyTitle')}>
          {t('insights.emptyBody', { month: words || '—' })}
        </EmptyState>
      )}

      {!loading && !error && !isEmpty && (
        <>
          <p className="cc-insights-analysis mb-0" style={{ fontSize: '0.9375rem' }}>
            <span style={LABEL_STYLE}>{t('insights.analysisLabel')}</span>
            <span className="num">{analysis}</span>
          </p>

          {bullets.length > 0 ? (
            <ul
              className="cc-insights-list"
              style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}
            >
              {bullets.map((row) => (
                <li key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}>
                    <Icon name={row.glyph} size={15} />
                  </span>
                  <span className="smallish">
                    <strong style={{ fontWeight: 700 }}>{row.tip ? t('insights.tipLabel') : t('insights.insightLabel')}</strong>{' '}
                    {row.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cc-insights-quiet smallish muted" style={{ margin: '14px 0 0' }}>
              {t('insights.noPatterns')}
            </p>
          )}

          <div className="cc-insights-foot" style={FOOT_STYLE}>
            <p className="smallish muted mb-0">
              <Icon name="info" size={14} />{' '}
              {plural('insights.basis', count, { count, month: words || '—' })}
            </p>
            {estimateNotes.map((note) => (
              <p key={note} className="smallish muted mb-0">
                <Icon name="bulb" size={14} /> {note}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
