import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Progress from '../components/Progress.jsx';
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { ledgerCurrencySymbol } from '../money.js';
import { uiLang } from '../dates.js';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/**
 * Budget goals (BUD-1..3): one limit per expense category, per month, with
 * the live bar next to it. The nudge wording sits once at the top so nobody
 * has to guess what 80% and 100% mean.
 */
export default function Budgets() {
  const { t, plural } = useLocale();
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
      push(t('bud.zeroError'), 'error');
      return;
    }
    setRowBusy(row.id);
    try {
      await api.post('/api/budgets', { categoryId: row.category.id, month, limitAmount: limit });
      push(t('bud.limitSaved', { name: row.category.name }));
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
      push(t('bud.limitRemoved', { name: target.category?.name || t('bud.thatCategory') }));
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
      setAddError(t('bud.catFirst'));
      return;
    }
    if (!newLimit || Number(newLimit) <= 0) {
      setAddError(t('bud.limitZero'));
      return;
    }
    setAdding(true);
    try {
      await api.post('/api/budgets', { categoryId: newCat, month, limitAmount: newLimit.trim() });
      setNewCat('');
      setNewLimit('');
      push(t('bud.added'));
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
      push(plural('bud.copied', data.copied ?? 0, { n: data.copied ?? 0 }));
      load(month);
    } catch (err) {
      push(err.message, 'error');
    }
  }

  return (
    <Page
      trail={[{ label: t('nav.budgets') }]}
      title={t('nav.budgets')}
      subtitle={t('bud.subtitle', { month: monthLabel(month) })}
      actions={
        <>
          <span className="d-inline-flex align-items-center gap-1">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label={t('ui.prevMonth')}
              title={t('ui.prevMonth')}
            >
              <Icon name="arrowLeft" />
            </button>
            <strong className="num" style={{ minWidth: 150, textAlign: 'center' }}>
              {monthLabel(month)}
            </strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label={t('ui.nextMonth')}
              title={t('ui.nextMonth')}
            >
              <Icon name="arrowRight" />
            </button>
          </span>
          <button type="button" className="btn btn-secondary" onClick={copyPrevious}>
            {t('bud.copy')}
          </button>
        </>
      }
    >
      <p className="smallish muted">
        <Icon name="info" /> {t('bud.nudgeNote')}
      </p>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 52, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 52, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 52 }} />
          <p className="smallish muted mb-0 mt-3">{t('bud.loading')}</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="table cc-stack-table">
              <caption className="visually-hidden">{t('bud.caption', { month: monthLabel(month) })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('ui.category')}</th>
                  <th scope="col">{t('ui.limit')}</th>
                  <th scope="col">{t('ui.spent')}</th>
                  <th scope="col">{t('ui.progress')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t('ui.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t('ui.category')}>
                      <span className="d-inline-flex align-items-center gap-2">
                        <span className="txn-ico" style={{ width: 32, height: 32 }}>
                          <CategoryIcon name={row.category?.icon} />
                        </span>
                        <strong>{row.category?.name || t('ui.category')}</strong>
                      </span>
                    </td>
                    <td data-label={t('ui.limit')}>
                      <span className="amount-wrap" style={{ display: 'inline-block', width: 120 }}>
<span className="amount-prefix" aria-hidden="true">{ledgerCurrencySymbol()}</span>
                        <input
                          className="input"
                          type="text"
                          inputMode="decimal"
                          aria-label={t('bud.limitAria', { name: row.category?.name })}
                          value={limits[row.id] ?? ''}
                          onChange={(e) => setLimits((l) => ({ ...l, [row.id]: e.target.value }))}
                        />
                      </span>
                    </td>
                    <td className="num" data-label={t('ui.spent')}>{money(row.spent)}</td>
                    <td data-label={t('ui.progress')} style={{ minWidth: 220 }}>
                      <Progress pct={row.pct} label={t('bud.spentOf', { spent: money(row.spent), limit: money(row.limit) })} />
                    </td>
                    <td data-label={t('ui.actions')}>
                      <div className="d-flex gap-1 justify-content-end">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={rowBusy === row.id}
                          onClick={() => saveRow(row)}
                        >
                          {rowBusy === row.id && <span className="spinner" aria-hidden="true" />}
                          {t('ui.save')}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setRemoving(row)}
                          aria-label={t('bud.removeAria', { name: row.category?.name })}
                          title={t('ui.remove')}
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

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="target" title={t('bud.emptyTitle', { month: monthLabel(month) })}>
            {t('bud.emptyBody')}
          </EmptyState>
        </div>
      )}

      <form className="card mt-3" onSubmit={addBudget} noValidate>
        <div className="card-title">
          <span>{t('bud.addTitle')}</span>
        </div>
        {addError && (
          <div className="field-error mb-3" role="alert">
            <Icon name="warning" />
            <span>{addError}</span>
          </div>
        )}
        <div className="d-flex gap-2 flex-wrap align-items-end">
          <div style={{ flex: '2 1 220px' }}>
            <FormField label={t('ui.category')} htmlFor="budget-category">
              {(a) => (
                <select
                  id="budget-category"
                  className="input"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  {...a}
                >
                  <option value="">{t('txf.chooseFromList')}</option>
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
            <FormField label={t('ui.monthlyLimit')} htmlFor="budget-limit">
              <div className="amount-wrap">
<span className="amount-prefix" aria-hidden="true">{ledgerCurrencySymbol()}</span>
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
              {t('ui.add')}
            </button>
          </div>
        </div>
        {available.length === 0 && (
          <p className="smallish muted mb-0">
            {t('bud.allHaveLimit')} <Link to="/categories">{t('bud.addAnotherCat')}</Link> {t('bud.goFurther')}
          </p>
        )}
      </form>

      {removing && (
        <Modal
          title={t('bud.removeTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow}>
                {t('bud.removeBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t('bud.removeBody', { name: removing.category?.name, month: monthLabel(month) })}
          </p>
        </Modal>
      )}
    </Page>
  );
}
