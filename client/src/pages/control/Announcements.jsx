import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';

function dayLabel(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
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
      setDraftError('An announcement needs a title.');
      return;
    }
    if (!draft.body.trim()) {
      setDraftError('Please write the message students will read.');
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
        push('Announcement published.');
      } else {
        await api.patch(`/api/control/announcements/${draft.id}`, payload);
        push('Announcement updated.');
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
      push('Announcement removed.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      trail={[{ label: 'Control', to: '/control' }, { label: 'Announcements' }]}
      title="Announcements"
      subtitle="Short campus notices that appear in every student's bell."
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          + New announcement
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
          <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 60 }} />
          <p className="smallish muted mb-0 mt-3">Loading announcements…</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="📢"
            title="No announcements yet"
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={openNew}>
                Write the first one
              </button>
            }
          >
            Deadline reminders, workshop dates, anything worth a line in the bell feed.
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
                  <span className="pill">⏸ Inactive</span>
                ) : (
                  <span className="pill pill-income">▶ Active</span>
                )}
              </div>
              <p className="mb-2">{row.body}</p>
              <p className="smallish muted mb-3">
                {dayLabel(row.startsAt || row.startDate) || 'Starts today'}
                {' → '}
                {row.endsAt || row.endDate ? dayLabel(row.endsAt || row.endDate) : 'no end date set'}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                  Edit
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(row)}>
                  🗑 Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.mode === 'new' ? 'New announcement' : 'Edit announcement'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" form="announcement-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="announcement-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{draftError}</span>
              </div>
            )}

            <FormField label="Title" htmlFor="announcement-title">
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

            <FormField label="Body" htmlFor="announcement-body">
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

            <FormField label="Starts" htmlFor="announcement-starts">
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

            <FormField label="Ends (optional)" htmlFor="announcement-ends" help="Leave blank to keep it running.">
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

            <FormField label="Show to students" htmlFor="announcement-active">
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
          title="Remove this announcement?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow}>
                Remove
              </button>
            </>
          }
        >
          <p className="mb-0">“{removing.title}” disappears from every bell feed straight away.</p>
        </Modal>
      )}
    </Page>
  );
}
