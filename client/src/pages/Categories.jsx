import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';

const ICONS = {
  wallet: '👛', cup: '☕', bus: '🚌', book: '📚', gift: '🎁', film: '🎞️',
  play: '🎮', house: '🏠', dots: '⋯', award: '🏆', briefcase: '💼', 'plus-circle': '➕',
};
function glyph(name) {
  return ICONS[name] || '🏷️';
}

const ICON_CHOICES = ['wallet', 'cup', 'bus', 'book', 'gift', 'film', 'play', 'house', 'dots', 'award', 'briefcase', 'plus-circle'];

/**
 * Manage Own Categories (CAT-3..5): defaults are shown but read-only, personal
 * ones can be renamed or removed — and removing one that still has entries
 * asks where those entries should move instead of orphaning them.
 */
export default function Categories() {
  const { t } = useLocale();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState(null); // { mode: 'new'|'edit', type, id?, name, icon }
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);

  const [removing, setRemoving] = useState(null); // category waiting to be deleted
  const [reassign, setReassign] = useState(null); // { category, message, targetId }

  function load() {
    api
      .get('/api/categories')
      .then(setData)
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = [
    { type: 'income', label: 'cat.groupIncome' },
    { type: 'expense', label: 'cat.groupExpense' },
  ];
  const byType = (type) => (data?.[type] || []).filter((c) => c.isActive !== false);

  function openNew(type) {
    setDraft({ mode: 'new', type, name: '', icon: 'dots' });
    setDraftError('');
  }

  function openEdit(category) {
    setDraft({ mode: 'edit', type: category.type, id: category.id, name: category.name, icon: category.icon || 'dots' });
    setDraftError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setDraftError('');
    if (!draft.name.trim()) {
      setDraftError(t('cat.nameError'));
      return;
    }

    setSaving(true);
    try {
      if (draft.mode === 'new') {
        await api.post('/api/categories', { name: draft.name.trim(), type: draft.type, icon: draft.icon });
        push(t('cat.added'));
      } else {
        await api.patch(`/api/categories/${draft.id}`, { name: draft.name.trim(), type: draft.type, icon: draft.icon });
        push(t('cat.updated'));
      }
      setDraft(null);
      load();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    const target = removing;
    setSaving(true);
    try {
      await api.del(`/api/categories/${target.id}`);
      push(t('cat.removed'));
      setRemoving(null);
      load();
    } catch (err) {
      // The server refuses with "in_use" when entries still point here and
      // asks for a destination — that is exactly the dialog we open below.
      if (err.status === 409 && err.message === 'in_use') {
        const others = (data?.[target.type] || []).filter((c) => c.id !== target.id && c.isActive !== false);
        setRemoving(null);
        if (others.length) {
          setReassign({ category: target, message: '', targetId: others[0].id });
        } else {
          push(
          t('cat.needsTarget', {
            type: t(target.type === 'income' ? 'cat.kindIncome' : 'cat.kindSpending'),
          }),
          'error'
        );
        }
      } else {
        push(err.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmReassign() {
    setSaving(true);
    try {
      await api.del(`/api/categories/${reassign.category.id}`, { reassignTo: reassign.targetId });
      push(t('cat.removedMoved'));
      setReassign(null);
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      trail={[{ label: t('nav.categories') }]}
      title={t('cat.title')}
      subtitle={t('cat.subtitle')}
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 44 }} />
          <p className="smallish muted mb-0 mt-3">{t('cat.loading')}</p>
        </div>
      )}

      {data &&
        groups.map((group) => {
          const items = byType(group.type);
          return (
            <section className="card mb-3" key={group.type}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h2 className="mb-0">{t(group.label)}</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openNew(group.type)}>
                  {t('cat.addBtn')}
                </button>
              </div>

              {items.length === 0 ? (
                <EmptyState icon="🏷️" title={t('cat.emptyTitle')}>
                  {t('cat.emptyBody', {
                    kind: t(group.type === 'income' ? 'cat.kindIncome' : 'cat.kindSpending'),
                  })}
                </EmptyState>
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {items.map((category) => (
                      <li key={category.id} className="txn-row">
                        <span className="txn-ico" aria-hidden="true">
                          {glyph(category.icon)}
                        </span>
                        <span className="txn-main">
                          <span className="txn-desc">{category.name}</span>
                        </span>
                        {category.isDefault && (
                          <span className="pill" title={t('cat.defaultPillTitle')}>
                            {t('cat.defaultPill')}
                          </span>
                        )}
                        {!category.isDefault && (
                          <span className="d-flex gap-1">
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => openEdit(category)}
                              aria-label={t('tx.editAria', { name: category.name })}
                              title={t('ui.edit')}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setRemoving(category)}
                              aria-label={t('tx.deleteAria', { name: category.name })}
                              title={t('ui.delete')}
                            >
                              🗑
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {items.some((c) => c.isDefault) && (
                <p className="smallish muted mb-0 mt-2">
                  {t('cat.managedF1')} <span className="pill">{t('cat.defaultPill')}</span> {t('cat.managedF2')}
                </p>
              )}
            </section>
          );
        })}

      {draft && (
        <Modal
          title={
          draft.mode === 'new'
            ? t('cat.newByType', { type: draft.type === 'income' ? t('ui.income') : t('ui.expense') })
            : t('cat.editTitle')
        }
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" form="category-draft-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.save')}
              </button>
            </>
          }
        >
          <form id="category-draft-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{draftError}</span>
              </div>
            )}

            <FormField label={t('ui.name')} htmlFor="category-name" help={t('cat.nameHelp')}>
              {(a) => (
                <input
                  id="category-name"
                  className="input"
                  type="text"
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ui.type')} htmlFor="category-type" help={t('cat.typeHelp')}>
              {(a) => (
                <input
                  id="category-type"
                  className="input"
                  value={draft.type === 'income' ? t('ui.income') : t('ui.expense')}
                  readOnly
                  disabled={draft.mode === 'edit'}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ui.icon')} htmlFor="category-icon">
              {(a) => (
                <select
                  id="category-icon"
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
          title={t('cat.delTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={confirmRemove} disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('cat.working') : t('cat.delBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t('cat.delBody', { name: removing.name })}
          </p>
        </Modal>
      )}

      {reassign && (
        <Modal
          title={t('cat.reassignTitle')}
          onClose={() => setReassign(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setReassign(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmReassign} disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {t('cat.moveBtn')}
              </button>
            </>
          }
        >
          <p>
            {t('cat.reassignBody', { name: reassign.category.name })}
          </p>
          <FormField label={t('cat.moveTo')} htmlFor="reassign-target">
            {(a) => (
              <select
                id="reassign-target"
                className="input"
                value={reassign.targetId}
                onChange={(e) => setReassign((r) => ({ ...r, targetId: e.target.value }))}
                {...a}
              >
                {(data?.[reassign.category.type] || [])
                  .filter((c) => c.id !== reassign.category.id && c.isActive !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
        </Modal>
      )}
    </Page>
  );
}
