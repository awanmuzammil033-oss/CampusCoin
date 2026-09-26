import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

const START = { q: '', type: '', category: '', from: '', to: '', page: 1 };

/**
 * The full ledger (TXN-5): search, filters and paging over one query state,
 * plus delete with a six-second undo so a mis-tap is never a disaster.
 */
export default function Transactions() {
  const { t } = useLocale();
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
      setUndo({ id: target.id, description: target.description || t('tx.entry') });
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
      push(t('tx.restored'));
      reload();
    } catch (err) {
      push(err.message, 'error');
    }
  }

  async function notADuplicate(row) {
    try {
      await api.post(`/api/transactions/${row.id}/not-duplicate`);
      push(t('tx.flagCleared'));
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
      trail={[{ label: t('nav.transactions') }]}
      title={t('nav.transactions')}
      subtitle={t('tx.subtitle')}
      actions={
        <>
          <Link className="btn btn-primary" to="/transactions/new">
            {t('tx.add')}
          </Link>
          <Link className="btn btn-secondary" to="/transactions/import">
            {t('home.link.importCsv')}
          </Link>
          <Link className="btn btn-ghost" to="/transactions/deleted">
            {t('tx.deleted')}
          </Link>
        </>
      }
    >
      <div className="card mb-3">
        <div className="d-flex gap-2 flex-wrap align-items-end">
          <div style={{ flex: '2 1 220px' }}>
            <FormField label={t('ui.search')} htmlFor="txn-search">
              {(a) => (
                <input
                  id="txn-search"
                  type="search"
                  className="input"
                  placeholder={t('tx.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <FormField label={t('ui.type')} htmlFor="txn-type">
              {(a) => (
                <select
                  id="txn-type"
                  className="input"
                  value={filters.type}
                  onChange={(e) => update({ type: e.target.value })}
                  {...a}
                >
                  <option value="">{t('ui.allTypes')}</option>
                  <option value="income">{t('ui.income')}</option>
                  <option value="expense">{t('ui.expense')}</option>
                </select>
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <FormField label={t('ui.category')} htmlFor="txn-category">
              {(a) => (
                <select
                  id="txn-category"
                  className="input"
                  value={filters.category}
                  onChange={(e) => update({ category: e.target.value })}
                  {...a}
                >
                  <option value="">{t('ui.allCategories')}</option>
                  {incomeCats.length > 0 && (
                    <optgroup label={t('ui.income')}>
                      {incomeCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {expenseCats.length > 0 && (
                    <optgroup label={t('ui.expense')}>
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
            <FormField label={t('ui.from')} htmlFor="txn-from">
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
            <FormField label={t('ui.to')} htmlFor="txn-to">
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
                {t('ui.clearFilters')}
              </button>
            </div>
          )}
        </div>
      </div>

      {undo && (
        <div className="card mb-3 d-flex align-items-center gap-3 flex-wrap" role="status">
          <span>
            {t('tx.deletedUndo', { description: undo.description })}
          </span>
          <button type="button" className="btn btn-secondary btn-sm ms-auto" onClick={restoreEntry}>
            {t('ui.undo')}
          </button>
          <span className="smallish muted">{t('tx.undoNote')}</span>
        </div>
      )}

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <p className="num mb-3" role="status">
          <span className="amount-income">{t('tx.incomeTotal', { amount: money(totals.income) })}</span>
          {' · '}
          <span className="amount-expense">{t('tx.expenseTotal', { amount: money(totals.expense) })}</span>
          {' · '}
          <strong>{t('tx.balanceTotal', { amount: money(Number(totals.income) - Number(totals.expense)) })}</strong>
        </p>
      )}

      {!data && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40 }} />
          <p className="smallish muted mb-0 mt-3">{t('tx.loading')}</p>
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="card">
          {filtered ? (
            <EmptyState
              icon="search"
              title={t('tx.noMatchTitle')}
              action={
                <button type="button" className="btn btn-secondary mt-2" onClick={clearFilters}>
                  {t('ui.clearFilters')}
                </button>
              }
            >
              {t('tx.noMatchBody')}
            </EmptyState>
          ) : (
            <EmptyState
              icon="wallet"
              title={t('dash.emptyTitle')}
              action={
                <Link className="btn btn-primary mt-2" to="/transactions/new?type=expense">
                  {t('dash.emptyLogExpense')}
                </Link>
              }
            >
              {t('tx.emptyBody')}
            </EmptyState>
          )}
        </div>
      )}

      {data && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="table cc-stack-table">
              <caption className="visually-hidden">{t('tx.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('ui.date')}</th>
                  <th scope="col">{t('ui.category')}</th>
                  <th scope="col">{t('ui.description')}</th>
                  <th scope="col">{t('ui.amount')}</th>
                  <th scope="col">{t('ui.flag')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t('ui.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num text-nowrap" data-label={t('ui.date')}>{dayLabel(row.date)}</td>
                    <td data-label={t('ui.category')}>
                      <span className="pill">{row.category?.name || '—'}</span>
                    </td>
                    <td data-label={t('ui.description')}>{row.description || <span className="muted">{t('ui.noDescription')}</span>}</td>
                    <td data-label={t('ui.amount')} className={`num ${row.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                      {row.type === 'income' ? '+' : '−'} <Icon name={row.type === 'income' ? 'trendUp' : 'trendDown'} />{' '}
                      {money(row.amount)}
                    </td>
                    <td data-label={t('ui.flag')}>
                      {row.flag === 'duplicate' && (
                        <span className="d-inline-flex align-items-center gap-1 flex-wrap">
                          <span className="flag-badge">{t('tx.looksDuplicate')}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => notADuplicate(row)}
                          >
                            {t('tx.notDuplicate')}
                          </button>
                        </span>
                      )}
                      {row.flag === 'large' && <span className="flag-badge">{t('tx.unusuallyLarge')}</span>}
                      {!row.flag || row.flag === 'none' ? <span className="muted">—</span> : null}
                    </td>
                    <td data-label={t('ui.actions')}>
                      <div className="d-flex gap-1 justify-content-end">
                        <Link
                          className="icon-btn"
                          to={`/transactions/${row.id}/history`}
                          aria-label={t('tx.historyAria', { name: row.description || t('tx.thisEntry') })}
                          title={t('ui.history')}
                        >
                          <Icon name="eye" />
                        </Link>
                        <Link
                          className="icon-btn"
                          to={`/transactions/${row.id}/edit`}
                          aria-label={t('tx.editAria', { name: row.description || t('tx.thisEntry') })}
                          title={t('ui.edit')}
                        >
                          <Icon name="pencil" />
                        </Link>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={t('tx.deleteAria', { name: row.description || t('tx.thisEntry') })}
                          title={t('ui.delete')}
                          onClick={() => setConfirmDelete(row)}
                        >
                          <Icon name="trash" />
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
          title={t('tx.deleteTitle')}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeEntry}>
                {t('tx.deleteBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t('tx.deleteBody', {
              name: confirmDelete.description || t('tx.thisEntryCap'),
              amount: money(confirmDelete.amount),
            })}
          </p>
        </Modal>
      )}
    </Page>
  );
}
