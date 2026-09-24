import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import TipCard from '../components/TipCard.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'dismissed', label: 'Dismissed' },
];

const EMPTY_COPY = {
  active: 'No tips for this month yet — they appear once there is spending to compare.',
  pinned: 'Nothing pinned. Pin a tip and it stays at the top of the list.',
  dismissed: 'Nothing dismissed. Anything you send away can be brought back here.',
};

/**
 * Tips (TIP-1..3): ranked by the money they could actually save, with the
 * three decisions the student owns — pin, bookmark with a note, dismiss.
 */
export default function Tips() {
  const { push } = useToast();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [tab, setTab] = useState('active');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bookmarkFor, setBookmarkFor] = useState(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  function load() {
    api
      .get(`/api/tips${qs({ month })}`)
      .then((data) => {
        setRows(data.rows || []);
        setError('');
      })
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function refresh() {
    setRefreshing(true);
    try {
      await api.post('/api/tips/generate', { month });
      load();
      push('Tips refreshed.');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function act(tip, action) {
    if (action === 'bookmark') {
      setBookmarkFor(tip);
      setNote(tip.note || '');
      return;
    }
    setBusyId(tip.id);
    try {
      await api.post(`/api/tips/${tip.id}/${action}`);
      if (action === 'dismiss') push('Tip dismissed for this month.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function bringBack(tip) {
    setBusyId(tip.id);
    try {
      await api.post(`/api/tips/${tip.id}/unpin`);
      push('Tip is back among the active ones.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setSavingNote(true);
    try {
      await api.post(`/api/tips/${bookmarkFor.id}/bookmark`, { note });
      setBookmarkFor(null);
      push('Bookmark saved.');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSavingNote(false);
    }
  }

  const visible = (rows || []).filter((tip) => tip.status === tab);

  return (
    <Page
      trail={[{ label: 'Tips' }]}
      title="Saving tips"
      subtitle="Tips are ranked by the money you could actually save."
      actions={
        <>
          <span className="d-inline-flex align-items-center gap-1">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
              title="Previous month"
            >
              ‹
            </button>
            <strong className="num" style={{ minWidth: 140, textAlign: 'center' }}>
              {monthLabel(month)}
            </strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
              title="Next month"
            >
              ›
            </button>
          </span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing && <span className="spinner" aria-hidden="true" />}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </>
      }
    >
      <div className="d-flex gap-2 flex-wrap mb-3" role="group" aria-label="Tip status">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label} ({(rows || []).filter((tip) => tip.status === t.id).length})
          </button>
        ))}
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 84, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 84, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 84 }} />
          <p className="smallish muted mb-0 mt-3">Gathering your tips…</p>
        </div>
      )}

      {rows && visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon="💡"
            title={`Nothing in "${TABS.find((t) => t.id === tab)?.label}"`}
            action={
              tab === 'active' ? (
                <button type="button" className="btn btn-secondary mt-2" onClick={refresh} disabled={refreshing}>
                  {refreshing ? 'Refreshing…' : 'Refresh tips'}
                </button>
              ) : undefined
            }
          >
            {EMPTY_COPY[tab]}
          </EmptyState>
        </div>
      )}

      {rows && visible.length > 0 && (
        <div className="d-grid gap-3">
          {visible.map((tip) =>
            tab === 'dismissed' ? (
              <div className="card tip-card" key={tip.id}>
                <div className="d-flex align-items-start gap-3 flex-wrap">
                  <p className="flex-grow-1 mb-0">{tip.text}</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === tip.id}
                    onClick={() => bringBack(tip)}
                    aria-label={`Bring back this tip: ${tip.text.slice(0, 60)}`}
                  >
                    {busyId === tip.id && <span className="spinner" aria-hidden="true" />}
                    Bring back
                  </button>
                </div>
              </div>
            ) : (
              <TipCard key={tip.id} tip={tip} busy={busyId === tip.id} onAction={(action) => act(tip, action)} />
            )
          )}
        </div>
      )}

      <p className="smallish muted mt-4 mb-0">
        <span aria-hidden="true"> ℹ️</span> Suggestions only — not financial advice.
      </p>

      {bookmarkFor && (
        <Modal
          title="Bookmark this tip"
          onClose={() => setBookmarkFor(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setBookmarkFor(null)}>
                Cancel
              </button>
              <button type="submit" form="tip-note-form" className="btn btn-primary" disabled={savingNote}>
                {savingNote && <span className="spinner" aria-hidden="true" />}
                Save
              </button>
            </>
          }
        >
          <form id="tip-note-form" onSubmit={saveNote}>
            <p className="smallish muted">“{bookmarkFor.text}”</p>
            <FormField label="Note (optional)" htmlFor="tip-note" help="Why you want to keep this one.">
              {(a) => (
                <textarea
                  id="tip-note"
                  className="input"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
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
