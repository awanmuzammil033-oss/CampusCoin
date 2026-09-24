import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';

function dayLabel(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** The bin: soft-deleted entries stay here until someone brings them back. */
export default function DeletedBin() {
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
      push('Entry restored — it is back in your list.');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[
        { label: 'Transactions', to: '/transactions' },
        { label: 'Deleted' },
      ]}
      title="Deleted entries"
      subtitle="Nothing is ever wiped — restorations are one click away."
      actions={
        <Link className="btn btn-ghost" to="/transactions">
          ← Back to transactions
        </Link>
      }
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 56, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 56, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 56 }} />
          <p className="smallish muted mb-0 mt-3">Checking the bin…</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="🗂️" title="Nothing in the bin." action={
            <Link className="btn btn-secondary mt-2" to="/transactions">
              Back to transactions
            </Link>
          }>
            Deleted entries land here first, so a slip of the finger never costs you data.
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => (
              <li key={row.id} className="txn-row">
                <span className="txn-ico" aria-hidden="true">
                  🧾
                </span>
                <span className="txn-main">
                  <span className="txn-desc">{row.description || 'Untitled entry'}</span>
                  <span className="txn-meta">
                    {row.category?.name || 'Uncategorised'} · {dayLabel(row.date)}
                  </span>
                </span>
                <span className={`txn-amount ${row.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                  {row.type === 'income' ? `+ ↑ ${money(row.amount)}` : `− ↓ ${money(row.amount)}`}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busyId === row.id}
                  onClick={() => restore(row)}
                  aria-label={`Restore ${row.description || 'this entry'}`}
                >
                  {busyId === row.id && <span className="spinner" aria-hidden="true" />}
                  {busyId === row.id ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
