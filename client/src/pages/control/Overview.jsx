import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useLocale } from '../../locale.jsx';
import { uiLang } from '../../dates.js';

/** Read the stats whichever of the two plausible key names the server uses. */
function readStats(payload, t) {
  const stats = payload?.stats || payload || {};
  const top = stats.mostUsedCategories || stats.topCategories || stats.categories || [];
  return {
    active: Number(stats.activeStudents ?? stats.activeUsers ?? stats.students ?? 0),
    transactions: Number(stats.totalTransactions ?? stats.transactions ?? stats.total ?? 0),
    top: (Array.isArray(top) ? top : []).map((row) =>
      typeof row === 'string'
        ? { name: row, count: 0 }
        : { name: row.name || row.category?.name || t('ui.category'), count: Number(row.count ?? row.total ?? 0) }
    ),
  };
}

/** Control › Overview (ADM-4): totals only — never anyone's individual rows. */
export default function Overview() {
  const { push } = useToast();
  const { t } = useLocale();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get('/api/control/stats')
      .then((payload) => {
        if (!alive) return;
        setStats(readStats(payload, t));
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
  }, [push]);

  const max = Math.max(1, ...(stats?.top || []).map((row) => row.count));

  return (
    <Page
      trail={[{ label: t('ctl.trail'), to: '/control' }, { label: t('ctl.navOverview') }]}
      title={t('ctl.navOverview')}
      subtitle={t('ctl.ovSubtitle')}
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!stats && !error && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div className="card">
            <div className="skeleton" style={{ height: 16, width: '50%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 34, width: '40%' }} />
          </div>
          <div className="card">
            <div className="skeleton" style={{ height: 16, width: '50%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 34, width: '60%' }} />
          </div>
        </div>
      )}

      {stats && (
        <>
          <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div className="card">
              <div className="card-title">
                <span>{t('ctl.activeStudents')}</span>
              </div>
              <div className="balance-display num">{stats.active.toLocaleString(uiLang())}</div>
            </div>
            <div className="card">
              <div className="card-title">
                <span>{t('ctl.totalTx')}</span>
              </div>
              <div className="balance-display num">{stats.transactions.toLocaleString(uiLang())}</div>
            </div>
          </div>

          <section className="card mt-3">
            <div className="card-title">
              <span>{t('ctl.topCategories')}</span>
            </div>
            {stats.top.length === 0 ? (
              <EmptyState icon="🏷️" title={t('ctl.noCategoriesTitle')}>
                {t('ctl.noCategoriesBody')}
              </EmptyState>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="d-grid gap-3">
                {stats.top.map((row, i) => (
                  <li key={`${row.name}-${i}`}>
                    <div className="d-flex justify-content-between smallish mb-1">
                      <span>
                        <strong>{i + 1}.</strong> {row.name}
                      </span>
                      <span className="num">{row.count.toLocaleString(uiLang())}</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.max(4, Math.round((row.count / max) * 100))}%`, background: 'var(--cc-primary)' }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="smallish muted mt-3 mb-0">
            <span aria-hidden="true"> ℹ️</span> {t('ctl.privacyNote')}
          </p>
        </>
      )}
    </Page>
  );
}
