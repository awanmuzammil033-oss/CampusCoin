import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useLocale } from '../../locale.jsx';

/**
 * Admin CRUD for the side-income library (ADV-5, ADM-2).
 *
 * The form is where the editorial rule of the feature is enforced, so it is
 * spelled out on the screen next to the switch that breaks it: a trending
 * idea has to carry a source. The server refuses one that does not, and the
 * form refuses it first so the coordinator finds out while still looking at
 * the entry rather than after a round trip.
 *
 * Everything else follows the panel's own idiom: one card per idea, the
 * active switch on the card, a delete confirmation before anything is
 * removed, and the list re-read after every change.
 */

const CATEGORIES = [
  { id: 'part-time', key: 'inc.catPartTime' },
  { id: 'freelance', key: 'inc.catFreelance' },
  { id: 'reselling', key: 'inc.catReselling' },
  { id: 'services', key: 'inc.catServices' },
];

const BLANK = {
  title: '',
  category: 'part-time',
  summary: '',
  howItWorks: '',
  typicalEffort: '',
  startupCost: '',
  sourceUrl: '',
  sourceNote: '',
  icon: '💡',
  isTrending: false,
  isActive: true,
  sortOrder: 0,
};

/** The host of a citation, so a card never prints a long raw address. */
function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function readRows(payload) {
  return payload?.rows || [];
}

export default function SideIncomeAdmin() {
  const { push } = useToast();
  const { t } = useLocale();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { mode, id?, ...fields }
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [removing, setRemoving] = useState(null);

  function load() {
    api
      .get('/api/control/side-income')
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
    setDraft({ mode: 'new', ...BLANK });
    setDraftError('');
  }

  function openEdit(row) {
    setDraft({ mode: 'edit', id: row.id, ...BLANK, ...row });
    setDraftError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setDraftError('');

    if (!draft.title.trim() || !draft.summary.trim()) {
      setDraftError(t('inc.admin.needBoth'));
      return;
    }
    // The same rule the service enforces, checked here so the coordinator is
    // told while the entry is still on screen.
    if (draft.isTrending && !draft.sourceUrl.trim() && !draft.sourceNote.trim()) {
      setDraftError(t('inc.admin.trendingRule'));
      return;
    }

    const payload = {
      title: draft.title.trim(),
      category: draft.category,
      summary: draft.summary.trim(),
      howItWorks: draft.howItWorks,
      typicalEffort: draft.typicalEffort,
      startupCost: draft.startupCost,
      sourceUrl: draft.sourceUrl.trim(),
      sourceNote: draft.sourceNote.trim(),
      icon: draft.icon.trim() || BLANK.icon,
      isTrending: draft.isTrending,
      isActive: draft.isActive,
      sortOrder: Number(draft.sortOrder) || 0,
    };

    setSaving(true);
    try {
      if (draft.mode === 'new') {
        await api.post('/api/control/side-income', payload);
        push(t('inc.admin.created'));
      } else {
        await api.patch(`/api/control/side-income/${draft.id}`, payload);
        push(t('inc.admin.updated'));
      }
      setDraft(null);
      load();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function patch(row, changes) {
    setBusyId(row.id);
    try {
      await api.patch(`/api/control/side-income/${row.id}`, changes);
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow() {
    setBusyId(removing.id);
    try {
      await api.del(`/api/control/side-income/${removing.id}`);
      setRemoving(null);
      push(t('inc.admin.deleted'));
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[{ label: t('ctl.trail'), to: '/control' }, { label: t('inc.admin.title') }]}
      title={t('inc.admin.title')}
      subtitle={t('inc.admin.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          <Icon name="plus" size={15} /> {t('inc.admin.newIdea')}
        </button>
      }
    >
      {error && (
        <div className="field-error mb-3" role="alert">
          <span><Icon name="warning" /></span>
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '55%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
          </div>
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
          </div>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="bulb"
            title={t('inc.admin.emptyTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={openNew}>
                {t('inc.admin.createFirst')}
              </button>
            }
          >
            {t('inc.admin.emptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {rows.map((row) => (
            <article className="card" key={row.id}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Icon name="bulb" glyph={row.icon} size={18} />
                <h2 className="h3 mb-0" style={{ minWidth: 0 }}>{row.title || t('ctl.untitled')}</h2>
              </div>

              <div className="d-flex gap-2 flex-wrap align-items-center mb-2">
                <span className="pill">{t(categoryKey(row.category))}</span>
                {row.isTrending && (
                  <span className="pill pill-suggest">
                    <Icon name="trendUp" size={13} /> {t('inc.trendingBadge')}
                  </span>
                )}
                {!row.isActive && <span className="pill">{t('ctl.paused')}</span>}
              </div>

              <p className="smallish muted mb-2">{row.summary || t('inc.admin.noSummary')}</p>

              {/* An unsourced row says so here too, so the gap is visible
                  before the badge is switched on rather than after. */}
              <p className="smallish mb-0">
                <span className="muted">{t('inc.sourceLabel')}:</span>{' '}
                {row.sourceNote || t('inc.noSource')}
                {row.sourceUrl && (
                  <>
                    {' · '}
                    <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>
                      {hostOf(row.sourceUrl)}
                    </a>
                  </>
                )}
              </p>

              <div className="d-flex gap-2 flex-wrap align-items-center mt-3">
                <button
                  type="button"
                  className={`btn btn-sm ${row.isActive ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={Boolean(row.isActive)}
                  disabled={busyId === row.id}
                  onClick={() => patch(row, { isActive: !row.isActive })}
                >
                  {row.isActive ? t('ctl.active') : t('ctl.paused')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                  {t('ui.edit')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setRemoving(row)}
                  aria-label={t('inc.admin.deleteAria', { title: row.title })}
                >
                  <Icon name="trash" size={15} /> {t('inc.admin.deleteBtn')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.mode === 'new' ? t('inc.admin.newIdea') : t('inc.admin.editIdea')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="side-income-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.save')}
              </button>
            </>
          }
        >
          <form id="side-income-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span><Icon name="warning" /></span>
                <span>{draftError}</span>
              </div>
            )}

            <FormField label={t('inc.admin.titleLabel')} htmlFor="side-income-title">
              {(a) => (
                <input
                  id="side-income-title"
                  className="input"
                  type="text"
                  maxLength={90}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('inc.admin.categoryLabel')} htmlFor="side-income-category">
              {(a) => (
                <select
                  id="side-income-category"
                  className="input"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  {...a}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {t(cat.key)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label={t('inc.admin.summaryLabel')}
              htmlFor="side-income-summary"
              help={t('inc.admin.summaryHelp')}
            >
              {(a) => (
                <textarea
                  id="side-income-summary"
                  className="input"
                  rows={3}
                  maxLength={300}
                  value={draft.summary}
                  onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField
              label={t('inc.admin.howLabel')}
              htmlFor="side-income-how"
              help={t('inc.admin.howHelp')}
            >
              {(a) => (
                <textarea
                  id="side-income-how"
                  className="input"
                  rows={5}
                  maxLength={1200}
                  value={draft.howItWorks}
                  onChange={(e) => setDraft((d) => ({ ...d, howItWorks: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <FormField
                label={t('inc.admin.effortLabel')}
                htmlFor="side-income-effort"
                help={t('inc.admin.effortHelp')}
              >
                {(a) => (
                  <input
                    id="side-income-effort"
                    className="input"
                    type="text"
                    maxLength={120}
                    placeholder={t('inc.admin.effortPh')}
                    value={draft.typicalEffort}
                    onChange={(e) => setDraft((d) => ({ ...d, typicalEffort: e.target.value }))}
                    {...a}
                  />
                )}
              </FormField>

              <FormField
                label={t('inc.admin.startupLabel')}
                htmlFor="side-income-startup"
                help={t('inc.admin.startupHelp')}
              >
                {(a) => (
                  <input
                    id="side-income-startup"
                    className="input"
                    type="text"
                    maxLength={120}
                    placeholder={t('inc.admin.startupPh')}
                    value={draft.startupCost}
                    onChange={(e) => setDraft((d) => ({ ...d, startupCost: e.target.value }))}
                    {...a}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label={t('inc.admin.iconLabel')}
              htmlFor="side-income-icon"
              help={t('inc.admin.iconHelp')}
            >
              {(a) => (
                <div className="d-flex align-items-center gap-2">
                  <Icon name="bulb" glyph={draft.icon || BLANK.icon} size={20} />
                  <input
                    id="side-income-icon"
                    className="input"
                    type="text"
                    maxLength={16}
                    value={draft.icon}
                    onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                    {...a}
                  />
                </div>
              )}
            </FormField>

            {/* the citation, and the rule that guards the badge */}
            <FormField
              label={t('inc.admin.sourceUrlLabel')}
              htmlFor="side-income-source-url"
              help={t('inc.admin.sourceUrlHelp')}
            >
              {(a) => (
                <input
                  id="side-income-source-url"
                  className="input"
                  type="text"
                  maxLength={300}
                  placeholder={t('inc.admin.sourceUrlPh')}
                  value={draft.sourceUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, sourceUrl: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField
              label={t('inc.admin.sourceNoteLabel')}
              htmlFor="side-income-source-note"
              help={t('inc.admin.sourceNoteHelp')}
            >
              {(a) => (
                <input
                  id="side-income-source-note"
                  className="input"
                  type="text"
                  maxLength={200}
                  value={draft.sourceNote}
                  onChange={(e) => setDraft((d) => ({ ...d, sourceNote: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <div className="field">
              <label className="cc-switch" htmlFor="side-income-trending">
                <input
                  id="side-income-trending"
                  type="checkbox"
                  checked={Boolean(draft.isTrending)}
                  onChange={(e) => setDraft((d) => ({ ...d, isTrending: e.target.checked }))}
                />
                <span className="cc-switch-track" aria-hidden="true" />
                <span className="cc-switch-label">{t('inc.admin.trendingLabel')}</span>
              </label>
              <div className="field-help">{t('inc.admin.trendingRule')}</div>
            </div>

            <div className="field">
              <label className="cc-switch" htmlFor="side-income-active">
                <input
                  id="side-income-active"
                  type="checkbox"
                  checked={Boolean(draft.isActive)}
                  onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                />
                <span className="cc-switch-track" aria-hidden="true" />
                <span className="cc-switch-label">{t('inc.admin.activeLabel')}</span>
              </label>
              <div className="field-help">{t('inc.admin.activeHelp')}</div>
            </div>

            <FormField
              label={t('inc.admin.orderLabel')}
              htmlFor="side-income-order"
              help={t('inc.admin.orderHelp')}
            >
              {(a) => (
                <input
                  id="side-income-order"
                  className="input"
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title={t('inc.admin.deleteTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow} disabled={busyId === removing.id}>
                {busyId === removing.id && <span className="spinner" aria-hidden="true" />}
                {t('inc.admin.deleteConfirm')}
              </button>
            </>
          }
        >
          <p className="mb-0">{t('inc.admin.deleteBody', { name: removing.title })}</p>
        </Modal>
      )}
    </Page>
  );
}

/** The stored category code, with a dictionary key for it. */
function categoryKey(category) {
  const known = CATEGORIES.find((c) => c.id === category);
  return known ? known.key : 'inc.catServices';
}
