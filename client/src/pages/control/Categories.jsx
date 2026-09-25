import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useLocale } from '../../locale.jsx';

const ICONS = {
  wallet: '👛', cup: '☕', bus: '🚌', book: '📚', gift: '🎁', film: '🎞️',
  play: '🎮', house: '🏠', dots: '⋯', award: '🏆', briefcase: '💼', 'plus-circle': '➕',
};
function glyph(name) {
  return ICONS[name] || '🏷️';
}

const ICON_CHOICES = ['wallet', 'cup', 'bus', 'book', 'gift', 'film', 'play', 'house', 'dots', 'award', 'briefcase', 'plus-circle'];

/** Read rows whether the server groups them by type or sends one flat list. */
function readRows(payload) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.categories)) return payload.categories;
  return [...(payload?.income || []), ...(payload?.expense || [])];
}

/** ADM-1: the default categories every student starts with. */
export default function ControlCategories() {
  const { push } = useToast();
  const { t } = useLocale();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { mode, id?, name, type, icon }
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  function load() {
    api
      .get('/api/control/categories')
      .then((payload) => {
        setRows(readRows(payload));
        setError('');
      })
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setDraft({ mode: 'new', name: '', type: 'expense', icon: 'dots' });
    setDraftError('');
  }

  function openEdit(row) {
    setDraft({ mode: 'edit', id: row.id, name: row.name, type: row.type, icon: row.icon || 'dots' });
    setDraftError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setDraftError('');
    if (!draft.name.trim()) {
      setDraftError(t('ctl.needName'));
      return;
    }
    setSaving(true);
    try {
      if (draft.mode === 'new') {
        await api.post('/api/control/categories', { name: draft.name.trim(), type: draft.type, icon: draft.icon });
        push(t('ctl.catAdded'));
      } else {
        await api.patch(`/api/control/categories/${draft.id}`, { name: draft.name.trim(), type: draft.type, icon: draft.icon });
        push(t('ctl.catUpdated'));
      }
      setDraft(null);
      load();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeRow() {
    setSaving(true);
    try {
      await api.del(`/api/control/categories/${removing.id}`);
      setRemoving(null);
      push(t('ctl.catRetired'));
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const groups = [
    { type: 'income', label: 'ctl.incomeCats' },
    { type: 'expense', label: 'ctl.expenseCats' },
  ];

  return (
    <Page
      trail={[{ label: t('ctl.trail'), to: '/control' }, { label: t('ctl.navCategories') }]}
      title={t('ctl.catTitle')}
      subtitle={t('ctl.catSubtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          {t('ctl.addDefault')}
        </button>
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
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44 }} />
          <p className="smallish muted mb-0 mt-3">{t('ctl.loadingCats')}</p>
        </div>
      )}

      {rows &&
        groups.map((group) => {
          const items = rows.filter((r) => r.type === group.type);
          if (!items.length) return null;
          return (
            <section className="card mb-3" key={group.type}>
              <div className="card-title">
                <span>{t(group.label)}</span>
                <span className="pill num">{items.length}</span>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <caption className="visually-hidden">{t(group.label)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('ui.name')}</th>
                      <th scope="col">{t('ui.type')}</th>
                      <th scope="col">{t('ui.status')}</th>
                      <th scope="col">{t('ui.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="d-inline-flex align-items-center gap-2">
                            <span aria-hidden="true">{glyph(row.icon)}</span>
                            <strong>{row.name}</strong>
                          </span>
                        </td>
                        <td>{row.type === 'income' ? t('ui.income') : t('ui.expense')}</td>
                        <td>
                          {row.isActive === false ? (
                            <span className="pill">{t('ctl.retired')}</span>
                          ) : (
                            <span className="pill pill-income">{t('ctl.activePill')}</span>
                          )}
                        </td>
                        <td>
                          <div className="d-flex gap-2">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                              {t('ui.edit')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger-outline btn-sm"
                              onClick={() => setRemoving(row)}
                              disabled={row.isActive === false}
                            >
                              {t('ui.remove')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

      {draft && (
        <Modal
          title={draft.mode === 'new' ? t('ctl.addDefault') : t('ctl.editCategory')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="control-category-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.save')}
              </button>
            </>
          }
        >
          <form id="control-category-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{draftError}</span>
              </div>
            )}

            <FormField label={t('ui.name')} htmlFor="control-category-name">
              {(a) => (
                <input
                  id="control-category-name"
                  className="input"
                  type="text"
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <div className="field">
              <span id="control-type-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
                {t('ui.type')}
              </span>
              <div className="chip-grid" role="group" aria-labelledby="control-type-label">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.type === 'income'}
                  onClick={() => setDraft((d) => ({ ...d, type: 'income' }))}
                >
                  {t('txf.incomeChip')}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.type === 'expense'}
                  onClick={() => setDraft((d) => ({ ...d, type: 'expense' }))}
                >
                  {t('txf.expenseChip')}
                </button>
              </div>
            </div>

            <FormField label={t('ui.icon')} htmlFor="control-category-icon">
              {(a) => (
                <select
                  id="control-category-icon"
                  className="input"
                  value={draft.icon}
                  onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                  {...a}
                >
                  {ICON_CHOICES.map((name) => (
                    <option key={name} value={name}>
                      {glyph(name)} {t(`cat.icon.${name}`)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title={t('ctl.retireTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow} disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.working') : t('ui.remove')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t('ctl.retireBody', { name: removing.name })}
          </p>
        </Modal>
      )}
    </Page>
  );
}
