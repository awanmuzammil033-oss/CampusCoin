import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';

function monthTitle(value) {
  if (!value) return '';
  const [y, m] = String(value).slice(0, 7).split('-').map(Number);
  if (!y || !m) return String(value);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const CLAMP = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

/** Bookmarks & notes (BKM-1): everything the student deliberately kept. */
export default function Bookmarks() {
  const { push } = useToast();
  const [tips, setTips] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { kind, id, note }
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/bookmarks')
      .then((data) => {
        if (!alive) return;
        setTips(data.tips || []);
        setInsights(data.insights || []);
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
  }, [push]);

  async function saveNote(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/api/bookmarks/${editing.kind}/${editing.id}/note`, { note: editing.note });
      applyLocal(editing.kind, editing.id, { note: editing.note });
      setEditing(null);
      push('Note saved.');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind, id) {
    setBusyKey(`${kind}-${id}`);
    try {
      await api.del(`/api/bookmarks/${kind}/${id}`);
      if (kind === 'tip') setTips((list) => (list || []).filter((t) => t.id !== id));
      else setInsights((list) => (list || []).filter((i) => i.id !== id));
      push('Removed from bookmarks.');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyKey(null);
    }
  }

  function applyLocal(kind, id, patch) {
    if (kind === 'tip') setTips((list) => (list || []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
    else setInsights((list) => (list || []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const loading = tips === null && insights === null && !error;
  const nothingAtAll = (tips?.length || 0) === 0 && (insights?.length || 0) === 0;

  const sections = [
    { kind: 'tip', title: 'Bookmarked tips', icon: '💡', rows: tips, empty: 'No bookmarked tips yet — pin the ones worth keeping.' },
    { kind: 'insight', title: 'Saved insights', icon: '🌤️', rows: insights, empty: 'No saved insights yet — bookmark a monthly summary and it lands here.' },
  ];

  return (
    <Page trail={[{ label: 'Bookmarks' }]} title="Bookmarks & notes" subtitle="Tips and insights you decided to keep.">
      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 70, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 70 }} />
          <p className="smallish muted mb-0 mt-3">Loading your bookmarks…</p>
        </div>
      )}

      {nothingAtAll && !loading && (
        <div className="card">
          <EmptyState
            icon="🔖"
            title="Nothing bookmarked yet"
            action={
              <div className="d-flex gap-2 justify-content-center flex-wrap mt-2">
                <Link className="btn btn-secondary" to="/tips">
                  Browse tips
                </Link>
                <Link className="btn btn-ghost" to="/insights">
                  Open insights
                </Link>
              </div>
            }
          >
            Nothing bookmarked yet — pin a tip or save an insight and it lands here.
          </EmptyState>
        </div>
      )}

      {sections.map((section) =>
        section.rows && section.rows.length > 0 ? (
          <section className="card mb-3" key={section.kind}>
            <div className="card-title">
              <span>
                {section.icon} {section.title}
              </span>
              <span className="pill num">{section.rows.length}</span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="d-grid gap-2">
              {section.rows.map((item) => (
                <li key={item.id} className="card">
                  <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                    <p className="smallish muted mb-1">{monthTitle(item.month)}</p>
                    <span className="smallish muted num">
                      {item.potentialSavings > 0 ? `Save ~${money(item.potentialSavings)}` : ''}
                    </span>
                  </div>
                  <p style={CLAMP} className="mb-2">
                    {item.text}
                    {item.tip ? ` — ${item.tip}` : ''}
                  </p>

                  {item.note && (
                    <p className="smallish muted mb-2">
                      <span aria-hidden="true">📝</span> {item.note}
                    </p>
                  )}

                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditing({ kind: section.kind, id: item.id, note: item.note || '' })}
                      aria-label={`Edit note for this ${section.kind}`}
                    >
                      📝 {item.note ? 'Edit note' : 'Note'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyKey === `${section.kind}-${item.id}`}
                      onClick={() => remove(section.kind, item.id)}
                      aria-label={`Remove this ${section.kind} from bookmarks`}
                    >
                      ✕ Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      )}

      {sections.map((section) =>
        section.rows && section.rows.length === 0 && !nothingAtAll ? (
          <section className="card mb-3" key={`${section.kind}-empty`}>
            <div className="card-title">
              <span>
                {section.icon} {section.title}
              </span>
            </div>
            <p className="muted smallish mb-0">{section.empty}</p>
          </section>
        ) : null
      )}

      {editing && (
        <Modal
          title="Your note"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" form="bookmark-note-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                Save note
              </button>
            </>
          }
        >
          <form id="bookmark-note-form" onSubmit={saveNote}>
            <FormField label="Note" htmlFor="bookmark-note" help="Optional, up to 500 characters.">
              {(a) => (
                <textarea
                  id="bookmark-note"
                  className="input"
                  rows={4}
                  maxLength={500}
                  value={editing.note}
                  onChange={(e) => setEditing((s) => ({ ...s, note: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}
    </Page>
  );
}
