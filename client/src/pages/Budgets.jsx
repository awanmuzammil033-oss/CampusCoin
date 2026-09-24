import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Progress from '../components/Progress.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

const ICONS = {
  wallet: '👛', cup: '☕', bus: '🚌', book: '📚', gift: '🎁', film: '🎞️',
  play: '🎮', house: '🏠', dots: '⋯', award: '🏆', briefcase: '💼', 'plus-circle': '➕',
};
function glyph(name) {
  return ICONS[name] || '🏷️';
}

/**
 * Budget goals (BUD-1..3): one limit per expense category, per month, with
 * the live bar next to it. The nudge wording sits once at the top so nobody
 * has to guess what 80% and 100% mean.
 */
export default function Budgets() {
  const { push } = useToast();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [rows, setRows] = useState(null);
  const [expenseCats, setExpenseCats] = useState([]);
  const [limits, setLimits] = useState({});
  const [rowBusy, setRowBusy] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');

  function load(targetMonth) {
    api
      .get(`/api/budgets${qs({ month: targetMonth })}`)
      .then((data) => {
        const list = data.rows || [];
        setRows(list);
        setLimits(Object.fromEntries(list.map((b) => [b.id, String(b.limit)])));
        setError('');
      })
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/categories')
      .then((d) => alive && setExpenseCats((d.expense || []).filter((c) => c.isActive !== false)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const existingIds = new Set((rows || []).map((b) => b.category?.id).filter(Boolean));
  const available = expenseCats.filter((c) => !existingIds.has(c.id));

  async function saveRow(row) {
    const limit = String(limits[row.id] ?? '').trim();
    if (!limit || Number(limit) <= 0) {
      push('A limit needs to be more than 0.', 'error');
      return;
    }
    setRowBusy(row.id);
    try {
      await api.post('/api/budgets', { categoryId: row.category.id, month, limitAmount: limit });
      push(`Limit saved for ${row.category.name}.`);
      load(month);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setRowBusy(null);
    }
  }

  async function removeRow() {
    const target = removing;
    setRowBusy(target.id);
    try {
      await api.del(`/api/budgets/${target.id}`);
      setRemoving(null);
      push(`Limit removed for ${target.category?.name || 'that category'}.`);
      load(month);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setRowBusy(null);
    }
  }

  async function addBudget(event) {
    event.preventDefault();
    setAddError('');
    if (!newCat) {
      setAddError('Choose a category first.');
      return;
    }
    if (!newLimit || Number(newLimit) <= 0) {
      setAddError('Enter a limit more than 0.');
      return;
    }
    setAdding(true);
    try {
      await api.post('/api/budgets', { categoryId: newCat, month, limitAmount: newLimit.trim() });
      setNewCat('');
      setNewLimit('');
      push('Budget added.');
      load(month);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function copyPrevious() {
    try {
      const data = await api.post('/api/budgets/copy-previous', { month });
      push(`Copied ${data.copied ?? 0} limits.`);
      load(month);
    } catch (err) {
      push(err.message, 'error');
    }
  }

  return (
    <Page
      trail={[{ label: 'Budgets' }]}
      title="Budgets"
      subtitle={`Monthly limits for ${monthLabel(month)}.`}
      actions={
        <>
          <span className="d-inline-flex align-items-center gap-1">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
              title="Previous month"
            >
              ‹
            </button>
            <strong className="num" style={{ minWidth: 150, textAlign: 'center' }}>
              {monthLabel(month)}
            </strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
              title="Next month"
            >
              ›
            </button>
          </span>
          <button type="button" className="btn btn-secondary" onClick={copyPrevious}>
            Copy last month
          </button>
        </>
      }
    >
      <p className="smallish muted">
        <span aria-hidden="true"> ℹ️</span> You'll get a nudge at 80% and again at 100% — once per month each.
      </p>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 52, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 52, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 52 }} />
          <p className="smallish muted mb-0 mt-3">Loading this month's limits…</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">Budget limits for {monthLabel(month)}</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Limit</th>
                  <th scope="col">Spent</th>
                  <th scope="col">Progress</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="d-inline-flex align-items-center gap-2">
                        <span className="txn-ico" aria-hidden="true" style={{ width: 32, height: 32 }}>
                          {glyph(row.category?.icon)}
                        </span>
                        <strong>{row.category?.name || 'Category'}</strong>
                      </span>
                    </td>
                    <td>
                      <span className="amount-wrap" style={{ display: 'inline-block', width: 120 }}>
                        <span className="amount-prefix" aria-hidden="true">
                          $
                        </span>
                        <input
                          className="input"
                          type="text"
                          inputMode="decimal"
                          aria-label={`Limit for ${row.category?.name}`}
                          value={limits[row.id] ?? ''}
                          onChange={(e) => setLimits((l) => ({ ...l, [row.id]: e.target.value }))}
                        />
                      </span>
                    </td>
                    <td className="num">{money(row.spent)}</td>
                    <td style={{ minWidth: 220 }}>
                      <Progress pct={row.pct} label={`${money(row.spent)} of ${money(row.limit)}`} />
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-end">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={rowBusy === row.id}
                          onClick={() => saveRow(row)}
                        >
                          {rowBusy === row.id && <span className="spinner" aria-hidden="true" />}
                          Save
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setRemoving(row)}
                          aria-label={`Remove budget for ${row.category?.name}`}
                          title="Remove"
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

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="🎯" title={`No budgets for ${monthLabel(month)} yet`}>
            Start with the category that always surprises you — Food is a popular first pick.
          </EmptyState>
        </div>
      )}

      <form className="card mt-3" onSubmit={addBudget} noValidate>
        <div className="card-title">
          <span>Add a budget</span>
        </div>
        {addError && (
          <div className="field-error mb-3" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{addError}</span>
          </div>
        )}
        <div className="d-flex gap-2 flex-wrap align-items-end">
          <div style={{ flex: '2 1 220px' }}>
            <FormField label="Category" htmlFor="budget-category">
              {(a) => (
                <select
                  id="budget-category"
                  className="input"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  {...a}
                >
                  <option value="">Choose a category</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <FormField label="Monthly limit" htmlFor="budget-limit">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="budget-limit"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                />
              </div>
            </FormField>
          </div>
          <div style={{ paddingBottom: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={adding || available.length === 0}>
              {adding && <span className="spinner" aria-hidden="true" />}
              Add
            </button>
          </div>
        </div>
        {available.length === 0 && (
          <p className="smallish muted mb-0">
            Every expense category already has a limit for this month.{' '}
            <Link to="/categories">Add another category</Link> to go further.
          </p>
        )}
      </form>

      {removing && (
        <Modal
          title="Remove this limit?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow}>
                Remove limit
              </button>
            </>
          }
        >
          <p className="mb-0">
            “{removing.category?.name}” stops having a cap for {monthLabel(month)}. Your entries stay exactly as
            they are.
          </p>
        </Modal>
      )}
    </Page>
  );
}
