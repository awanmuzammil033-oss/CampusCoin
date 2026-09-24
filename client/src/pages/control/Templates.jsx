import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api, qs } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';

const CLAMP = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const BLANK = { code: '', kind: 'tip', title: '', bodyTemplate: '' };

function readRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.rows || payload?.templates || [];
}

/** ADM-2: the wording behind every tip and campus announcement. */
export default function Templates() {
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { mode, id?, ...fields }
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [removing, setRemoving] = useState(null);

  function load() {
    api
      .get('/api/control/templates')
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
    setDraft({
      mode: 'edit',
      id: row.id,
      code: row.code || '',
      kind: row.kind || 'tip',
      title: row.title || '',
      bodyTemplate: row.bodyTemplate || row.body || '',
    });
    setDraftError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setDraftError('');
    if (!draft.title.trim() || !draft.bodyTemplate.trim()) {
      setDraftError('A template needs both a title and a body.');
      return;
    }
    if (draft.mode === 'new' && !draft.code.trim()) {
      setDraftError('Please give the template a short code.');
      return;
    }

    setSaving(true);
    try {
      const payload = { kind: draft.kind, title: draft.title.trim(), bodyTemplate: draft.bodyTemplate };
      if (draft.mode === 'new') {
        await api.post('/api/control/templates', { code: draft.code.trim(), ...payload });
        push('Template created.');
      } else {
        await api.patch(`/api/control/templates/${draft.id}`, payload);
        push('Template updated.');
      }
      setDraft(null);
      load();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    setBusyId(row.id);
    try {
      await api.patch(`/api/control/templates/${row.id}`, { isActive: !row.isActive });
      push(row.isActive ? 'Template switched off.' : 'Template switched on.');
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
      await api.del(`/api/control/templates/${removing.id}`);
      setRemoving(null);
      push('Template deleted.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[{ label: 'Control', to: '/control' }, { label: 'Templates' }]}
      title="Templates"
      subtitle="The wording behind saving tips and campus announcements."
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          + New template
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
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
          </div>
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
          </div>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="📝"
            title="No templates yet"
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={openNew}>
                Create the first one
              </button>
            }
          >
            Templates decide the wording students see — write one here.
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {rows.map((row) => (
            <article className="card" key={row.id}>
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <span className="smallish muted num">{row.code || '—'}</span>
                <span className={row.kind === 'announcement' ? 'pill pill-suggest' : 'pill pill-income'}>
                  {row.kind === 'announcement' ? 'Announcement' : 'Tip'}
                </span>
              </div>
              <h2 className="h3">{row.title || 'Untitled'}</h2>
              <p style={CLAMP} className="smallish muted">
                {row.bodyTemplate || row.body || 'No body text yet.'}
              </p>

              <div className="d-flex gap-2 flex-wrap align-items-center mt-2">
                <button
                  type="button"
                  className={`btn btn-sm ${row.isActive ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={Boolean(row.isActive)}
                  disabled={busyId === row.id}
                  onClick={() => toggleActive(row)}
                >
                  {row.isActive ? 'Active' : 'Paused'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setRemoving(row)}
                  aria-label={`Delete template ${row.code || row.title}`}
                >
                  🗑 Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.mode === 'new' ? 'New template' : 'Edit template'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" form="template-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="template-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span aria-hidden="true">⚠</span>
                <span>{draftError}</span>
              </div>
            )}

            {draft.mode === 'new' && (
              <FormField label="Code" htmlFor="template-code" help="Short and stable, e.g. budget_pace.">
                {(a) => (
                  <input
                    id="template-code"
                    className="input"
                    type="text"
                    maxLength={40}
                    value={draft.code}
                    onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                    {...a}
                  />
                )}
              </FormField>
            )}

            <FormField label="Kind" htmlFor="template-kind">
              {(a) => (
                <select
                  id="template-kind"
                  className="input"
                  value={draft.kind}
                  onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
                  {...a}
                >
                  <option value="tip">Tip</option>
                  <option value="announcement">Announcement</option>
                </select>
              )}
            </FormField>

            <FormField label="Title" htmlFor="template-title">
              {(a) => (
                <input
                  id="template-title"
                  className="input"
                  type="text"
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField
              label="Body"
              htmlFor="template-body"
              help="Use {{amount}}, {{category}}, {{pct}} placeholders — they fill in per student."
            >
              {(a) => (
                <textarea
                  id="template-body"
                  className="input"
                  rows={5}
                  maxLength={2000}
                  value={draft.bodyTemplate}
                  onChange={(e) => setDraft((d) => ({ ...d, bodyTemplate: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title="Delete this template?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow}>
                Delete template
              </button>
            </>
          }
        >
          <p className="mb-0">
            “{removing.title || removing.code}” disappears from future tips. Tips already written for this month
            stay until they are refreshed.
          </p>
        </Modal>
      )}
    </Page>
  );
}
