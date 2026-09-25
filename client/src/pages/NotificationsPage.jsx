import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

/** Every alert and campus notice in one readable list (BUD-3 feed). */
export default function NotificationsPage() {
  const { t } = useLocale();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    api
      .get('/api/notifications')
      .then((data) => setRows(data.rows))
      .catch((err) => setError(err.message));
  }, []);

  async function markAll() {
    try {
      await api.post('/api/notifications/read-all');
      setRows((list) => (list || []).map((r) => ({ ...r, isRead: true })));
      toast.push(t('noti.markedAll'));
    } catch (err) {
      toast.push(err.message, 'error');
    }
  }

  async function markOne(row) {
    if (String(row.id).startsWith('ann-')) return;
    if (row.isRead) return;
    try {
      await api.post(`/api/notifications/${row.id}/read`);
      setRows((list) => list.map((r) => (r.id === row.id ? { ...r, isRead: true } : r)));
    } catch {}
  }

  return (
    <Page
      trail={[{ label: t('noti.title') }]}
      title={t('noti.title')}
      subtitle={t('noti.subtitle')}
      actions={
        <button type="button" className="btn btn-secondary" onClick={markAll}>
          {t('noti.markAll')}
        </button>
      }
    >
      {error && (
        <div className="field-error" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="🔕" title={t('noti.emptyTitle')}>
            {t('noti.emptyF1')} <Link to="/budgets">{t('noti.budgetsLink')}</Link> {t('noti.emptyF2')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="txn-row w-100 text-start"
                  style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--cc-border)', cursor: 'pointer' }}
                  onClick={() => markOne(row)}
                >
                  <span className="txn-ico" aria-hidden="true">
                    {row.kind === 'budget_exceeded' ? '⛔' : row.kind === 'budget_near' ? '⚠️' : row.kind === 'announcement' ? '📢' : 'ℹ️'}
                  </span>
                  <span className="txn-main">
                    <span className="txn-desc">{row.message}</span>
                    <span className="txn-meta">{new Date(row.createdAt).toLocaleString(uiLang())}</span>
                  </span>
                  {!row.isRead && !String(row.id).startsWith('ann-') && (
                    <span className="pill pill-suggest">{t('noti.new')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
