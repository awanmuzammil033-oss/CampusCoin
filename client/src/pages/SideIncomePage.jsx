import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';

/**
 * The side-income library (ADV-5): a curated set of ways a student can earn
 * on the side, each one carrying where its claims came from.
 *
 * The page has one job beyond listing rows, and that is to keep its own
 * promises small. It says up front that these are ideas and not income
 * promises, it quotes no figure of its own, and where an idea has no source
 * it says so in words instead of printing a link that goes nowhere. That is
 * the whole editorial position of the screen.
 *
 * Every sentence comes from the dictionary, so the page reads in the same
 * fourteen languages as the rest of the app.
 */

const START = { q: '', category: '', trending: '', page: 1 };

/** The filter chips, in the order they are offered. */
const CATEGORIES = [
  { id: 'part-time', key: 'inc.catPartTime', icon: 'briefcase' },
  { id: 'freelance', key: 'inc.catFreelance', icon: 'laptop' },
  { id: 'reselling', key: 'inc.catReselling', icon: 'shirt' },
  { id: 'services', key: 'inc.catServices', icon: 'hand' },
];

/** The link label: the host, not the whole address, so nothing has to wrap. */
function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export default function SideIncomePage() {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [search, setSearch] = useState(''); // typed freely, sent after 300ms
  const [filters, setFilters] = useState(START);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim(), page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let alive = true;
    api
      .get(`/api/side-income${qs(filters)}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });
    return () => {
      alive = false;
    };
  }, [filters, push]);

  function update(patch) {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  function clearFilters() {
    setSearch('');
    setFilters(START);
  }

  const rows = data?.rows || [];
  const stats = data?.stats || null;
  const pagination = data?.pagination || { page: 1, pages: 1 };
  const filtered = Boolean(filters.q || filters.category || filters.trending);
  const allOn = !filters.category && !filters.trending;

  return (
    <Page trail={[{ label: t('inc.title') }]} title={t('inc.title')} subtitle={t('inc.subtitle')}>
      {/* the honest bit, before any card: orientation, never a promise */}
      <div className="card mb-3">
        <p className="mb-2">{t('inc.intro')}</p>
        <p className="smallish muted mb-0 d-flex align-items-start gap-2">
          <Icon name="info" size={15} /> {t('inc.disclaimer')}
        </p>
      </div>

      <div className="card mb-3">
        <div style={{ maxWidth: 420 }}>
          <FormField label={t('ui.search')} htmlFor="inc-search">
            {(a) => (
              <input
                id="inc-search"
                type="search"
                className="input"
                placeholder={t('inc.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                {...a}
              />
            )}
          </FormField>
        </div>

        <div className="field">
          <span
            id="inc-filter-label"
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
          >
            {t('inc.filtersLabel')}
          </span>
          <div className="chip-grid" role="group" aria-labelledby="inc-filter-label">
            <button type="button" className="chip" aria-pressed={allOn} onClick={clearFilters}>
              {t('ui.all')}
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="chip"
                aria-pressed={filters.category === cat.id}
                onClick={() => update({ category: filters.category === cat.id ? '' : cat.id })}
              >
                <Icon name={cat.icon} size={14} /> {t(cat.key)}
              </button>
            ))}
            {/* Trending is a narrowing filter on top of whatever is chosen, so
                it is a separate chip rather than another category. */}
            <button
              type="button"
              className="chip"
              aria-pressed={Boolean(filters.trending)}
              onClick={() => update({ trending: filters.trending ? '' : 'true' })}
            >
              <Icon name="trendUp" size={14} /> {t('inc.chipTrending')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }} role="status">
          {[0, 1, 2].map((n) => (
            <div className="card" key={n}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: '75%' }} />
            </div>
          ))}
          <p className="smallish muted mb-0" style={{ gridColumn: '1 / -1' }}>
            {t('inc.loading')}
          </p>
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon={filtered ? 'search' : 'bulb'}
            title={filtered ? t('inc.noMatchTitle') : t('inc.emptyTitle')}
            action={
              filtered ? (
                <button type="button" className="btn btn-secondary mt-2" onClick={clearFilters}>
                  {t('ui.clearFilters')}
                </button>
              ) : undefined
            }
          >
            {filtered ? t('inc.noMatchBody') : t('inc.emptyBody')}
          </EmptyState>
        </div>
      )}

      {data && rows.length > 0 && (
        <>
          <p className="smallish muted mb-2">
            {plural('inc.count', pagination.total, { n: pagination.total })}
            {stats && stats.trending > 0 ? ` · ${t('inc.trendingCount', { n: stats.trending })}` : ''}
          </p>

          <div className="d-grid gap-3">
            {rows.map((row) => (
              <IdeaCard key={row.id} t={t} row={row} />
            ))}
          </div>

          <Pagination
            page={pagination.page || 1}
            pages={pagination.pages || 1}
            onPage={(p) => update({ page: p })}
          />
        </>
      )}
    </Page>
  );
}

/**
 * One idea. Everything on the card is something an administrator wrote and
 * cited; the page adds the honest labels and refuses to invent a link.
 */
function IdeaCard({ t, row }) {
  const hasSource = Boolean(row.sourceNote || row.sourceUrl);

  return (
    <article className="card">
      <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
          <span className="txn-ico">
            <Icon name="bulb" glyph={row.icon} />
          </span>
          <h2 className="mb-0" style={{ fontSize: '1.0625rem', minWidth: 0, overflowWrap: 'anywhere' }}>
            {row.title}
          </h2>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="pill">{t(categoryKey(row.category))}</span>
          {/* The badge is the claim that needs a source behind it, so it is
              labelled in words and not left to a colour or an arrow. */}
          {row.isTrending && (
            <span className="pill pill-suggest">
              <Icon name="trendUp" size={13} /> {t('inc.trendingBadge')}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 mb-2">{row.summary}</p>

      {row.howItWorks && (
        <details>
          <summary className="smallish" style={{ cursor: 'pointer', fontWeight: 600 }}>
            {t('inc.howItWorks')}
          </summary>
          <p className="smallish muted mb-0 mt-2">{row.howItWorks}</p>
        </details>
      )}

      {(row.typicalEffort || row.startupCost) && (
        <div className="smallish mt-3">
          {row.typicalEffort && (
            <p className="mb-1">
              <span className="muted">{t('inc.effortLabel')}:</span> {row.typicalEffort}
            </p>
          )}
          {row.startupCost && (
            <p className="mb-0">
              <span className="muted">{t('inc.startupLabel')}:</span> {row.startupCost}
            </p>
          )}
        </div>
      )}

      {/* The citation, or the plain fact that there is not one. A trending
          idea always has one — the service refuses to save it otherwise. */}
      <div
        className="d-flex align-items-baseline gap-2 flex-wrap mt-3 pt-3"
        style={{ borderTop: '1px solid var(--cc-border)', overflowWrap: 'anywhere' }}
      >
        <span className="smallish muted">{t('inc.sourceLabel')}</span>
        {row.sourceNote && <span className="smallish">{row.sourceNote}</span>}
        {row.sourceUrl && (
          <a
            className="smallish"
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ overflowWrap: 'anywhere' }}
          >
            <Icon name="globe" size={13} /> {hostOf(row.sourceUrl)}
          </a>
        )}
        {!hasSource && <span className="smallish muted">{t('inc.noSource')}</span>}
      </div>
    </article>
  );
}

/** The stored category code, with a dictionary key for it. */
function categoryKey(category) {
  const known = CATEGORIES.find((c) => c.id === category);
  return known ? known.key : 'inc.catServices';
}
