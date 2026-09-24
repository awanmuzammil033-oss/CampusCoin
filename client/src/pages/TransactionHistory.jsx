import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

function money(value) {
  const n = Number(value || 0);
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function dayLabel(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ACTIONS = {
  create: { icon: '➕', label: 'Created' },
  update: { icon: '✏️', label: 'Edited' },
  delete: { icon: '🗑', label: 'Deleted' },
  restore: { icon: '♻️', label: 'Restored' },
};

// Only these fields can change — everything else about an entry is fixed.
const FIELDS = ['amount', 'category', 'description', 'date', 'type'];

/** Read one field out of a before/after snapshot, the way a person would. */
function showValue(field, snapshot, names) {
  const value = snapshot?.[field];
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'amount') return money(value);
  if (field === 'date') return dayLabel(value);
  if (field === 'type') return value === 'income' ? 'Income' : 'Expense';
  if (field === 'category') {
    return snapshot.categoryName || names[String(value)] || `Category …${String(value).slice(-4)}`;
  }
  return String(value);
}

/**
 * Full audit trail (TXN-4): one row per action, showing only the fields
 * that actually changed, with the old value struck through.
 */
export default function TransactionHistory() {
  const { id } = useParams();
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    api
      .get(`/api/transactions/${id}/history`)
      .then((data) => alive && setRows(data.rows || []))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });

    // History stores the category id; the names make the "before" column readable.
    api
      .get('/api/categories')
      .then((d) => {
        if (!alive) return;
        const map = {};
        [...(d.income || []), ...(d.expense || [])].forEach((c) => {
          map[c.id] = c.name;
        });
        setNames(map);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [id, push]);

  return (
    <Page
      trail={[
        { label: 'Transactions', to: '/transactions' },
        { label: 'Entry history' },
      ]}
      title="Entry history"
      subtitle="Every change to this entry, newest first."
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
          <div className="skeleton" style={{ height: 70, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 70, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 70 }} />
          <p className="smallish muted mb-0 mt-3">Loading the trail…</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="📜" title="Nothing recorded yet" action={
            <Link className="btn btn-secondary mt-2" to="/transactions">
              Back to transactions
            </Link>
          }>
            Edits, deletions and restorations show up here the moment they happen.
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((row) => {
            const action = ACTIONS[row.action] || { icon: '•', label: row.action };
            const before = row.before || null;
            const after = row.after || null;
            const changed = FIELDS.filter((field) => String(before?.[field]) !== String(after?.[field]));

            return (
              <li key={row.id} className="card mb-3">
                <div className="d-flex align-items-center gap-3">
                  <span className="txn-ico" aria-hidden="true">
                    {action.icon}
                  </span>
                  <div>
                    <strong>{action.label}</strong>{' '}
                    <span className="smallish muted">
                      {new Date(row.changedAt).toLocaleString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {changed.length === 0 ? (
                  <p className="smallish muted mb-0 mt-2">No field values changed.</p>
                ) : (
                  <div className="d-grid gap-1 mt-3">
                    {changed.map((field) => (
                      <div key={field} className="d-flex gap-2 align-items-baseline flex-wrap smallish">
                        <span className="muted" style={{ minWidth: 96 }}>
                          {field.charAt(0).toUpperCase() + field.slice(1)}
                        </span>
                        <s className="muted">{showValue(field, before, names)}</s>
                        <span aria-hidden="true">→</span>
                        <strong>{showValue(field, after, names)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
