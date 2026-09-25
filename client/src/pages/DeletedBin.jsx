import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

/** The bin: soft-deleted entries stay here until someone brings them back. */
export default function DeletedBin() {
  const { t } = useLocale();
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/transactions/deleted/list')
      .then((data) => alive && setRows(data.rows || []))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });
    return () => {
      alive = false;
    };
  }, [push]);

  async function restore(row) {
    setBusyId(row.id);
    try {
      await api.post(`/api/transactions/${row.id}/restore`);
      setRows((list) => (list || []).filter((r) => r.id !== row.id));
      push(t('tx.restoredBack'));
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[
        { label: t('nav.transactions'), to: '/transactions' },
        { label: t('tx.deleted') },
      ]}
      title={t('tx.deletedTitle')}
      subtitle={t('tx.binSubtitle')}
      actions={
        <Link className="btn btn-ghost" to="/transactions">
          <Icon name="arrowLeft" /> {t('tx.backPlain')}
        </Link>
      }
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 56, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 56, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 56 }} />
          <p className="smallish muted mb-0 mt-3">{t('tx.checkingBin')}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="trash" title={t('tx.binEmptyTitle')} action={
            <Link className="btn btn-secondary mt-2" to="/transactions">
              {t('tx.backPlain')}
            </Link>
          }>
            {t('tx.binEmptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => (
              <li key={row.id} className="txn-row">
                <span className="txn-ico">
                  <Icon name="receipt" />
                </span>
                <span className="txn-main">
                  <span className="txn-desc">{row.description || t('dash.untitled')}</span>
                  <span className="txn-meta">
                    {row.category?.name || t('dash.uncategorised')} · {dayLabel(row.date)}
                  </span>
                </span>
                <span className={`txn-amount ${row.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                  {row.type === 'income' ? '+' : '−'} <Icon name={row.type === 'income' ? 'trendUp' : 'trendDown'} />{' '}
                  {money(row.amount)}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busyId === row.id}
                  onClick={() => restore(row)}
                  aria-label={t('tx.restoreAria', { name: row.description || t('tx.thisEntry') })}
                >
                  {busyId === row.id && <span className="spinner" aria-hidden="true" />}
                  {busyId === row.id ? t('tx.restoring') : t('tx.restore')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
