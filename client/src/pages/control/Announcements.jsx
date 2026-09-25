import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useLocale } from '../../locale.jsx';
import { uiLang } from '../../dates.js';

function dayLabel(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(uiLang(), { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.rows || payload?.announcements || [];
}

function blankDraft() {
  return { title: '', body: '', startsAt: todayISO(), endsAt: '', isActive: true };
}

/** ADM-2: campus-wide notices, shown in the bell feed while they run. */
export default function Announcements() {
  const { push } = useToast();
  const { t } = useLocale();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { mode, id?, ...fields }
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  function load() {
    api
      .get('/api/control/announcements')
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
    setDraft({ mode: 'new', ...blankDraft() });
    setDraftError('');
  }

  function openEdit(row) {
    setDraft({
      mode: 'edit',
      id: row.id,
      title: row.title || '',
      body: row.body || '',
      startsAt: String(row.startsAt || row.startDate || '').slice(0, 10),
      endsAt: String(row.endsAt || row.endDate || '').slice(0, 10),
      isActive: row.isActive !== false,
    });
    setDraftError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setDraftError('');
    if (!draft.title.trim()) {
      setDraftError(t('ctl.annNeedTitle'));
      return;
    }
    if (!draft.body.trim()) {
      setDraftError(t('ctl.annNeedBody'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        body: draft.body.trim(),
        startsAt: draft.startsAt || todayISO(),
        endsAt: draft.endsAt || null,
        isActive: draft.isActive,
      };
      if (draft.mode === 'new') {
        await api.post('/api/control/announcements', payload);
        push(t('ctl.annPublished'));
      } else {
        await api.patch(`/api/control/announcements/${draft.id}`, payload);
        push(t('ctl.annUpdated'));
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
      await api.del(`/api/control/announcements/${removing.id}`);
      setRemoving(null);
      push(t('ctl.annRemoved'));
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      trail={[{ label: t('ctl.trail'), to: '/control' }, { label: t('ctl.navAnnouncements') }]}
      title={t('ctl.navAnnouncements')}
      subtitle={t('ctl.annSubtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          {t('ctl.newAnn')}
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
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 60 }} />
          <p className="smallish muted mb-0 mt-3">{t('ctl.loadingAnns')}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="megaphone"
            title={t('ctl.annEmptyTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={openNew}>
                {t('ctl.annWriteFirst')}
              </button>
            }
          >
            {t('ctl.annEmptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="d-grid gap-3">
          {rows.map((row) => (
            <article className="card" key={row.id}>
              <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                <h2 className="h3 mb-1">{row.title}</h2>
                {row.isActive === false ? (
                  <span className="pill">{t('ctl.inactive')}</span>
                ) : (
                  <span className="pill pill-income"><Icon name="checkCircle" size={13} /> {t('ctl.activePill')}</span>
                )}
              </div>
              <p className="mb-2">{row.body}</p>
              <p className="smallish muted mb-3">
                {dayLabel(row.startsAt || row.startDate) || t('ctl.startsToday')}{' '}
                <Icon name="arrowRight" />{' '}
                {row.endsAt || row.endDate ? dayLabel(row.endsAt || row.endDate) : t('ctl.noEndDate')}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                  {t('ui.edit')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(row)}>
                  <Icon name="trash" size={15} /> {t('ctl.removeBtn')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.mode === 'new' ? t('ctl.newAnn') : t('ctl.editAnn')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="announcement-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.save')}
              </button>
            </>
          }
        >
          <form id="announcement-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span><Icon name="warning" /></span>
                <span>{draftError}</span>
              </div>
            )}

            <FormField label={t('ctl.title')} htmlFor="announcement-title">
              {(a) => (
                <input
                  id="announcement-title"
                  className="input"
                  type="text"
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ctl.body')} htmlFor="announcement-body">
              {(a) => (
                <textarea
                  id="announcement-body"
                  className="input"
                  rows={4}
                  maxLength={1000}
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ctl.starts')} htmlFor="announcement-starts">
              {(a) => (
                <input
                  id="announcement-starts"
                  type="date"
                  className="input"
                  value={draft.startsAt}
                  onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ctl.ends')} htmlFor="announcement-ends" help={t('ctl.endsHelp')}>
              {(a) => (
                <input
                  id="announcement-ends"
                  type="date"
                  className="input"
                  value={draft.endsAt}
                  onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ctl.showToStudents')} htmlFor="announcement-active">
              {(a) => (
                <input
                  id="announcement-active"
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title={t('ctl.removeAnnTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow}>
                {t('ui.remove')}
              </button>
            </>
          }
        >
          <p className="mb-0">{t('ctl.removeAnnBody', { name: removing.title })}</p>
        </Modal>
      )}
    </Page>
  );
}
