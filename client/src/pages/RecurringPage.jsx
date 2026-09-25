import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { currencySymbol } from '../money.js';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

const ICONS = {
  wallet: '👛', cup: '☕', bus: '🚌', book: '📚', gift: '🎁', film: '🎞️',
  play: '🎮', house: '🏠', dots: '⋯', award: '🏆', briefcase: '💼', 'plus-circle': '➕',
};
function glyph(name) {
  return ICONS[name] || '🏷️';
}

function dayLabel(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(uiLang(), { day: '2-digit', month: 'short', year: 'numeric' });
}

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

/** "Every Monday" for weekly rules, "Monthly on the 5th" for monthly ones. */
function whenLabel(rule, t) {
  if (rule.frequency === 'weekly') {
    const [y, m, d] = String(rule.startDate || '').slice(0, 10).split('-').map(Number);
    const weekday = y && m && d
      ? new Date(y, m - 1, d).toLocaleDateString(uiLang(), { weekday: 'long' })
      : t('rec.week');
    return t('rec.everyWeekday', { day: weekday });
  }
  const n = Number(rule.dayOfPeriod) || 1;
  return t('rec.monthlyOn', { day: uiLang().startsWith('en') ? ordinal(n) : String(n) });
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
  const { t } = useLocale();
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
      setDraftError(t('txf.amountMore'));
      return;
    }
    if (!draft.categoryId) {
      setDraftError(t('txf.chooseCategory'));
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
      push(t('rec.added'));
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
      setEditError(t('txf.amountMore'));
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
      push(t('rec.updated'));
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
      push(rule.isActive ? t('rec.pausedMsg') : t('rec.activeMsg'));
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
      push(t('rec.removed'));
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[{ label: t('nav.recurring') }]}
      title={t('rec.title')}
      subtitle={t('rec.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
          {t('rec.addBtn')}
        </button>
      }
    >
      <div className="card mb-3 smallish muted">
        <span aria-hidden="true"> ℹ️</span> {t('rec.autoNote')}
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
          <p className="smallish muted mb-0 mt-3">{t('rec.loading')}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="🔁"
            title={t('rec.emptyTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={() => setShowNew(true)}>
                {t('rec.emptyBtn')}
              </button>
            }
          >
            {t('rec.emptyBody')}
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
                  <span className="txn-desc">{rule.description || rule.category?.name || t('rec.untitled')}</span>
                  <span className="txn-meta">
                    <span className="pill" style={{ marginRight: 8 }}>
                      {rule.category?.name || '—'}
                    </span>
                    {whenLabel(rule, t)} · {t('rec.lastGenerated', { date: dayLabel(rule.lastGeneratedOn) })}
                  </span>
                </span>
                <span className={`txn-amount ${rule.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                  {rule.type === 'income' ? `+ ↑ ${money(rule.amount)}` : `− ↓ ${money(rule.amount)}`}
                </span>
                <span className={rule.isActive ? 'pill pill-income' : 'pill'}>
                  {rule.isActive ? t('rec.active') : t('rec.paused')}
                </span>
                <span className="d-flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === rule.id}
                    onClick={() => togglePause(rule)}
                    aria-label={rule.isActive ? t('rec.pauseAria', { name: rule.description || t('rec.thisRule') }) : t('rec.resumeAria', { name: rule.description || t('rec.thisRule') })}
                  >
                    {rule.isActive ? t('rec.pause') : t('rec.resume')}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => openEdit(rule)}
                    aria-label={t('tx.editAria', { name: rule.description || t('rec.thisRule') })}
                    title={t('ui.edit')}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setRemoving(rule)}
                    aria-label={t('tx.deleteAria', { name: rule.description || t('rec.thisRule') })}
                    title={t('ui.delete')}
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
          title={t('rec.newTitle')}
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button type="submit" form="recurring-new-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.save')}
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
                {t('ui.type')}
              </span>
              <div className="chip-grid" role="group" aria-labelledby="recurring-type-label">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.type === 'income'}
                  onClick={() => setDraft((d) => ({ ...d, type: 'income', categoryId: '' }))}
                >
                  {t('txf.incomeChip')}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.type === 'expense'}
                  onClick={() => setDraft((d) => ({ ...d, type: 'expense', categoryId: '' }))}
                >
                  {t('txf.expenseChip')}
                </button>
              </div>
            </div>

            <FormField label={t('ui.amount')} htmlFor="recurring-amount">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">{currencySymbol()}</span>
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
                {t('ui.category')}
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
                {draftOptions.length === 0 && <span className="muted smallish">{t('rec.noCats')}</span>}
              </div>
            </div>

            <FormField label={t('ui.frequency')} htmlFor="recurring-frequency">
              {(a) => (
                <select
                  id="recurring-frequency"
                  className="input"
                  value={draft.frequency}
                  onChange={(e) => setDraftField('frequency', e.target.value)}
                  {...a}
                >
                  <option value="weekly">{t('rec.weekly')}</option>
                  <option value="monthly">{t('rec.monthly')}</option>
                </select>
              )}
            </FormField>

            <FormField label={t('ui.description')} htmlFor="recurring-description">
              {(a) => (
                <input
                  id="recurring-description"
                  className="input"
                  type="text"
                  maxLength={255}
                  placeholder={t('rec.descPlaceholder')}
                  value={draft.description}
                  onChange={(e) => setDraftField('description', e.target.value)}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('rec.startDate')} htmlFor="recurring-start" help={t('rec.startHelp')}>
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
          title={t('rec.editTitle')}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" form="recurring-edit-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.saveChanges')}
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

            <FormField label={t('ui.amount')} htmlFor="edit-amount">
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">{currencySymbol()}</span>
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

            <FormField label={t('ui.description')} htmlFor="edit-description">
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

            <FormField label={t('rec.endDate')} htmlFor="edit-end" help={t('rec.endHelp')}>
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
          title={t('rec.removeTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRule}>
                {t('ui.remove')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t('rec.removeBody', { name: removing.description || t('rec.thisRuleCap') })}
          </p>
        </Modal>
      )}
    </Page>
  );
}
