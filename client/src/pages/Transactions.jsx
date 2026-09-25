import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';

function dayLabel(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

const START = { q: '', type: '', category: '', from: '', to: '', page: 1 };

/**
 * The full ledger (TXN-5): search, filters and paging over one query state,
 * plus delete with a six-second undo so a mis-tap is never a disaster.
 */
export default function Transactions() {
  const { push } = useToast();
  const [search, setSearch] = useState(''); // typed freely, sent after 300ms
  const [filters, setFilters] = useState(START);
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);

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
      .get('/api/categories')
      .then((d) => {
        if (alive) setCategories({ income: d.income || [], expense: d.expense || [] });
      })
      .catch(() => {}); // the list still works without the category picker
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get(`/api/transactions${qs(filters)}`)
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
  }, [filters, reloadKey, push]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  function update(patch) {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  function clearFilters() {
    setSearch('');
    setFilters(START);
  }

  function reload() {
    setReloadKey((k) => k + 1);
  }

  async function removeEntry() {
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.del(`/api/transactions/${target.id}`);
      setData((d) => (d ? { ...d, rows: d.rows.filter((r) => r.id !== target.id) } : d));
      setUndo({ id: target.id, description: target.description || 'Entry' });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    } catch (err) {
      push(err.message, 'error');
      reload();
    }
  }

  async function restoreEntry() {
    const target = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    if (!target) return;
    try {
      await api.post(`/api/transactions/${target.id}/restore`);
      push('Entry restored.');
      reload();
    } catch (err) {
      push(err.message, 'error');
    }
  }

  async function notADuplicate(row) {
    try {
      await api.post(`/api/transactions/${row.id}/not-duplicate`);
      push('Flag cleared — thanks for checking.');
      reload();
    } catch (err) {
      push(err.message, 'error');
    }
  }

  const rows = data?.rows || [];
  const totals = data?.totals || { income: 0, expense: 0 };
  const filtered = Boolean(filters.q || filters.type || filters.category || filters.from || filters.to);
  const incomeCats = categories.income;
  const expenseCats = categories.expense;

  return (
    <Page
      trail={[{ label: 'Transactions' }]}
      title="Transactions"
      subtitle="Everything you have logged, newest first."
      actions={
        <>
          <Link className="btn btn-primary" to="/transactions/new">
            + Add
          </Link>
          <Link className="btn btn-secondary" to="/transactions/import">
            Import CSV
          </Link>
          <Link className="btn btn-ghost" to="/transactions/deleted">
            Deleted
          </Link>
        </>
      }
    >
      <div className="card mb-3">
        <div className="d-flex gap-2 flex-wrap align-items-end">
          <div style={{ flex: '2 1 220px' }}>
            <FormField label="Search" htmlFor="txn-search">
              {(a) => (
                <input
                  id="txn-search"
                  type="search"
                  className="input"
                  placeholder="e.g. campus cafe"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <FormField label="Type" htmlFor="txn-type">
              {(a) => (
                <select
                  id="txn-type"
                  className="input"
                  value={filters.type}
                  onChange={(e) => update({ type: e.target.value })}
                  {...a}
                >
                  <option value="">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <FormField label="Category" htmlFor="txn-category">
              {(a) => (
                <select
                  id="txn-category"
                  className="input"
                  value={filters.category}
                  onChange={(e) => update({ category: e.target.value })}
                  {...a}
                >
                  <option value="">All categories</option>
                  {incomeCats.length > 0 && (
                    <optgroup label="Income">
                      {incomeCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {expenseCats.length > 0 && (
                    <optgroup label="Expense">
                      {expenseCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <FormField label="From" htmlFor="txn-from">
              {(a) => (
                <input
                  id="txn-from"
                  type="date"
                  className="input"
                  value={filters.from}
                  onChange={(e) => update({ from: e.target.value })}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <FormField label="To" htmlFor="txn-to">
              {(a) => (
                <input
                  id="txn-to"
                  type="date"
                  className="input"
                  value={filters.to}
                  onChange={(e) => update({ to: e.target.value })}
                  {...a}
                />
              )}
            </FormField>
          </div>
          {filtered && (
            <div style={{ paddingBottom: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {undo && (
        <div className="card mb-3 d-flex align-items-center gap-3 flex-wrap" role="status">
          <span>
            Deleted “{undo.description}”. Changed your mind?
          </span>
          <button type="button" className="btn btn-secondary btn-sm ms-auto" onClick={restoreEntry}>
            Undo
          </button>
          <span className="smallish muted">The entry also stays in the bin.</span>
        </div>
      )}

      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {data && (
        <p className="num mb-3" role="status">
          <span className="amount-income">Income {money(totals.income)}</span>
          {' · '}
          <span className="amount-expense">Expenses {money(totals.expense)}</span>
          {' · '}
          <strong>Balance {money(Number(totals.income) - Number(totals.expense))}</strong>
        </p>
      )}

      {!data && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40 }} />
          <p className="smallish muted mb-0 mt-3">Loading your entries…</p>
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="card">
          {filtered ? (
            <EmptyState
              icon="🔍"
              title="No entries match these filters"
              action={
                <button type="button" className="btn btn-secondary mt-2" onClick={clearFilters}>
                  Clear filters
                </button>
              }
            >
              Try a wider date range, or clear the filters to see everything.
            </EmptyState>
          ) : (
            <EmptyState
              icon="💰"
              title="No entries yet"
              action={
                <Link className="btn btn-primary mt-2" to="/transactions/new?type=expense">
                  Log your first expense
                </Link>
              }
            >
              Your whole month fits on this page — start it in 10 seconds.
            </EmptyState>
          )}
        </div>
      )}

      {data && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">Transactions for the current filters</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Category</th>
                  <th scope="col">Description</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Flag</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num text-nowrap">{dayLabel(row.date)}</td>
                    <td>
                      <span className="pill">{row.category?.name || '—'}</span>
                    </td>
                    <td>{row.description || <span className="muted">No description</span>}</td>
                    <td className={`num ${row.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                      {row.type === 'income' ? `+ ↑ ${money(row.amount)}` : `− ↓ ${money(row.amount)}`}
                    </td>
                    <td>
                      {row.flag === 'duplicate' && (
                        <span className="d-inline-flex align-items-center gap-1 flex-wrap">
                          <span className="flag-badge">Looks duplicated</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => notADuplicate(row)}
                          >
                            Not a duplicate
                          </button>
                        </span>
                      )}
                      {row.flag === 'large' && <span className="flag-badge">Unusually large</span>}
                      {!row.flag || row.flag === 'none' ? <span className="muted">—</span> : null}
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-end">
                        <Link
                          className="icon-btn"
                          to={`/transactions/${row.id}/history`}
                          aria-label={`View history for ${row.description || 'this entry'}`}
                          title="History"
                        >
                          👁
                        </Link>
                        <Link
                          className="icon-btn"
                          to={`/transactions/${row.id}/edit`}
                          aria-label={`Edit ${row.description || 'this entry'}`}
                          title="Edit"
                        >
                          ✏️
                        </Link>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Delete ${row.description || 'this entry'}`}
                          title="Delete"
                          onClick={() => setConfirmDelete(row)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && (
        <Pagination
          page={data.pagination?.page || 1}
          pages={data.pagination?.pages || 1}
          onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      )}

      {confirmDelete && (
        <Modal
          title="Delete this entry?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeEntry}>
                Delete entry
              </button>
            </>
          }
        >
          <p className="mb-0">
            “{confirmDelete.description || 'This entry'}” ({money(confirmDelete.amount)}) moves to the bin.
            You can undo straight away, or restore it later from the Deleted page.
          </p>
        </Modal>
      )}
    </Page>
  );
}
