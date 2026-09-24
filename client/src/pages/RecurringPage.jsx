import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

const ICONS = {
  wallet: '👛', cup: '☕', bus: '🚌', book: '📚', gift: '🎁', film: '🎞️',
  play: '🎮', house: '🏠', dots: '⋯', award: '🏆', briefcase: '💼', 'plus-circle': '➕',
};
function glyph(name) {
  return ICONS[name] || '🏷️';
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function dayLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

/** "Every Monday" for weekly rules, "Monthly on the 5th" for monthly ones. */
function whenLabel(rule) {
  if (rule.frequency === 'weekly') {
    const [y, m, d] = String(rule.startDate || '').slice(0, 10).split('-').map(Number);
    const weekday = y && m && d
      ? new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })
      : 'week';
    return `Every ${weekday}`;
  }
  return `Monthly on the ${ordinal(Number(rule.dayOfPeriod) || 1)}`;
}

const BLANK_RULE = { type: 'expense', amount: '', categoryId: '', frequency: 'monthly', description: '', startDate: '' };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Recurring entries (TXN-3): allowance in, subscriptions out, both filled in
 * by the generator so nobody has to remember the 1st of the month.
 */
export default function RecurringPage() {
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK_RULE, startDate: todayISO() });
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null); // the rule being edited
  const [editForm, setEditForm] = useState({ amount: '', description: '', endDate: '' });
  const [editError, setEditError] = useState('');
  const [removing, setRemoving] = useState(null); // the rule being deleted
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .get('/api/recurring')
      .then((data) => setRows(data.rows || []))
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load();
    api
      .get('/api/categories')
      .then((d) => setCategories([...(d.income || []), ...(d.expense || [])]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftOptions = categories.filter((c) => c.type === draft.type && c.isActive !== false);

  function setDraftField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function saveNew(event) {
    event.preventDefault();
    setDraftError('');
    if (!draft.amount || Number(draft.amount) <= 0) {
      setDraftError('Amount must be more than 0.');
      return;
    }
    if (!draft.categoryId) {
      setDraftError('Please choose a category.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/recurring', {
        type: draft.type,
        amount: draft.amount,
        categoryId: draft.categoryId,
        frequency: draft.frequency,
        description: draft.description,
        startDate: draft.startDate || todayISO(),
      });
      setShowNew(false);
      setDraft({ ...BLANK_RULE, startDate: todayISO() });
      push('Recurring entry added.');
      load();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(rule) {
    setEditing(rule);
    setEditForm({
      amount: String(rule.amount),
      description: rule.description || '',
      endDate: rule.endDate ? String(rule.endDate).slice(0, 10) : '',
    });
    setEditError('');
  }

  async function saveEdit(event) {
    event.preventDefault();
    setEditError('');
    if (!editForm.amount || Number(editForm.amount) <= 0) {
      setEditError('Amount must be more than 0.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/recurring/${editing.id}`, {
        amount: editForm.amount,
        description: editForm.description,
        endDate: editForm.endDate || null,
      });
      setEditing(null);
      push('Recurring entry updated.');
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePause(rule) {
    setBusyId(rule.id);
    try {
      await api.patch(`/api/recurring/${rule.id}`, { isActive: !rule.isActive });
      push(rule.isActive ? 'Paused — no new entries will appear.' : 'Active again.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeRule() {
    const target = removing;
    setBusyId(target.id);
    try {
      await api.del(`/api/recurring/${target.id}`);
      setRemoving(null);
      push('Recurring entry removed. Entries already generated stay in your list.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[{ label: 'Recurring' }]}
      title="Recurring entries"
      subtitle="Monthly allowance, weekly transport, every subscription."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
          + New recurring
        </button>
      }
    >
      <div className="card mb-3 smallish muted">
        <span aria-hidden="true"> ℹ️</span> Entries appear automatically — the generator only fills dates that
        don't exist yet.
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 64, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 64, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 64 }} />
          <p className="smallish muted mb-0 mt-3">Loading your rules…</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="🔁"
            title="No recurring entries yet"
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={() => setShowNew(true)}>
                Add your first one
              </button>
            }
          >
            Set your allowance once and it logs itself every month.
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((rule) => (
              <li key={rule.id} className="txn-row flex-wrap">
                <span className="txn-ico" aria-hidden="true">
                  {glyph(rule.category?.icon)}
                </span>
                <span className="txn-main">
                  <span className="txn-desc">{rule.description || rule.category?.name || 'Recurring entry'}</span>
                  <span className="txn-meta">
                    <span className="pill" style={{ marginRight: 8 }}>
                      {rule.category?.name || '—'}
                    </span>
                    {whenLabel(rule)} · last generated {dayLabel(rule.lastGeneratedOn)}
                  </span>
                </span>
                <span className={`txn-amount ${rule.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                  {rule.type === 'income' ? `+ ↑ ${money(rule.amount)}` : `− ↓ ${money(rule.amount)}`}
                </span>
                <span className={rule.isActive ? 'pill pill-income' : 'pill'}>
                  {rule.isActive ? '▶ Active' : '⏸ Paused'}
                </span>
                <span className="d-flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === rule.id}
                    onClick={() => togglePause(rule)}
                    aria-label={`${rule.isActive ? 'Pause' : 'Resume'} ${rule.description || 'this rule'}`}
                  >
                    {rule.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => openEdit(rule)}
                    aria-label={`Edit ${rule.description || 'this rule'}`}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setRemoving(rule)}
                    aria-label={`Delete ${rule.description || 'this rule'}`}
                    title="Delete"
                  >
                    🗑
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNew && (
        <Modal
          title="New recurring entry"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button type="submit" form="recurring-new-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="recurring-new-form" onSubmit={saveNew} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{draftError}</span>
              </div>
            )}

            <div className="field">
              <span id="recurring-type-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                Type
              </span>
              <div className="chip-grid" role="group" aria-labelledby="recurring-type-label">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.type === 'income'}
                  onClick={() => setDraft((d) => ({ ...d, type: 'income', categoryId: '' }))}
                >
                  + Income
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.type === 'expense'}
                  onClick={() => setDraft((d) => ({ ...d, type: 'expense', categoryId: '' }))}
                >
                  − Expense
                </button>
              </div>
            </div>

            <FormField label="Amount" htmlFor="recurring-amount">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">$</span>
                <input
                  id="recurring-amount"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.amount}
                  onChange={(e) => setDraftField('amount', e.target.value)}
                />
              </div>
            </FormField>

            <div className="field">
              <span id="recurring-cat-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                Category
              </span>
              <div className="chip-grid" role="group" aria-labelledby="recurring-cat-label">
                {draftOptions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    aria-pressed={draft.categoryId === c.id}
                    onClick={() => setDraftField('categoryId', c.id)}
                  >
                    <span aria-hidden="true">{glyph(c.icon)}</span>
                    {c.name}
                  </button>
                ))}
                {draftOptions.length === 0 && <span className="muted smallish">No categories for this type.</span>}
              </div>
            </div>

            <FormField label="Frequency" htmlFor="recurring-frequency">
              {(a) => (
                <select
                  id="recurring-frequency"
                  className="input"
                  value={draft.frequency}
                  onChange={(e) => setDraftField('frequency', e.target.value)}
                  {...a}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              )}
            </FormField>

            <FormField label="Description" htmlFor="recurring-description">
              {(a) => (
                <input
                  id="recurring-description"
                  className="input"
                  type="text"
                  maxLength={255}
                  placeholder="e.g. monthly allowance"
                  value={draft.description}
                  onChange={(e) => setDraftField('description', e.target.value)}
                  {...a}
                />
              )}
            </FormField>

            <FormField label="Start date" htmlFor="recurring-start" help="The first period begins here.">
              {(a) => (
                <input
                  id="recurring-start"
                  type="date"
                  className="input"
                  value={draft.startDate}
                  onChange={(e) => setDraftField('startDate', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal
          title="Edit recurring entry"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" form="recurring-edit-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          }
        >
          <form id="recurring-edit-form" onSubmit={saveEdit} noValidate>
            {editError && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{editError}</span>
              </div>
            )}

            <FormField label="Amount" htmlFor="edit-amount">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">$</span>
                <input
                  id="edit-amount"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </FormField>

            <FormField label="Description" htmlFor="edit-description">
              {(a) => (
                <input
                  id="edit-description"
                  className="input"
                  type="text"
                  maxLength={255}
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label="End date (optional)" htmlFor="edit-end" help="Leave blank to keep it running.">
              {(a) => (
                <input
                  id="edit-end"
                  type="date"
                  className="input"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title="Remove this recurring entry?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRule}>
                Remove
              </button>
            </>
          }
        >
          <p className="mb-0">
            “{removing.description || 'This rule'}” stops here. Entries it already generated stay in your list
            with their history.
          </p>
        </Modal>
      )}
    </Page>
  );
}
