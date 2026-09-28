import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import TipCard from '../components/TipCard.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

const TABS = [
  { id: 'active', label: 'tip.tabActive' },
  { id: 'pinned', label: 'tip.tabPinned' },
  { id: 'dismissed', label: 'tip.tabDismissed' },
];

const EMPTY_COPY = {
  active: 'tip.emptyActive',
  pinned: 'tip.emptyPinned',
  dismissed: 'tip.emptyDismissed',
};

/**
 * Tips (TIP-1..3): ranked by the money they could actually save, with the
 * three decisions the student owns — pin, bookmark with a note, dismiss.
 */
export default function Tips() {
  const { t } = useLocale();
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
      push(t('tip.refreshed'));
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
      if (action === 'dismiss') push(t('tip.dismissed'));
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
      push(t('tip.broughtBack'));
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
      push(t('tip.bookmarkSaved'));
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
      loading={!rows && !error}
      trail={[{ label: t('nav.tips') }]}
      title={t('tip.title')}
      subtitle={t('tip.subtitle')}
      actions={
        <>
          <span className="d-inline-flex align-items-center gap-1">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label={t('ui.prevMonth')}
              title={t('ui.prevMonth')}
            >
              <Icon name="arrowLeft" />
            </button>
            <strong className="num" style={{ minWidth: 140, textAlign: 'center' }}>
              {monthLabel(month)}
            </strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label={t('ui.nextMonth')}
              title={t('ui.nextMonth')}
            >
              <Icon name="arrowRight" />
            </button>
          </span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing && <span className="spinner" aria-hidden="true" />}
            {refreshing ? t('tip.refreshing') : t('tip.refresh')}
          </button>
        </>
      }
    >
      <div className="d-flex gap-2 flex-wrap mb-3" role="group" aria-label={t('tip.statusAria')}>
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            className={`btn ${tab === tabDef.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            aria-pressed={tab === tabDef.id}
            onClick={() => setTab(tabDef.id)}
          >
            {t(tabDef.label)} ({(rows || []).filter((tip) => tip.status === tabDef.id).length})
          </button>
        ))}
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 84, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 84, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 84 }} />
          <p className="smallish muted mb-0 mt-3">{t('tip.loading')}</p>
        </div>
      )}

      {rows && visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon="bulb"
            title={t('tip.emptyTabTitle', { tab: t(TABS.find((x) => x.id === tab)?.label) })}
            action={
              tab === 'active' ? (
                <button type="button" className="btn btn-secondary mt-2" onClick={refresh} disabled={refreshing}>
                  {refreshing ? t('tip.refreshing') : t('tip.refreshTips')}
                </button>
              ) : undefined
            }
          >
            {t(EMPTY_COPY[tab])}
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
                    aria-label={t('tip.bringBackAria', { text: tip.text.slice(0, 60) })}
                  >
                    {busyId === tip.id && <span className="spinner" aria-hidden="true" />}
                    {t('tip.bringBack')}
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
        <Icon name="info" /> {t('ui.suggestionsOnly')}
      </p>

      {bookmarkFor && (
        <Modal
          title={t('tip.bookmarkTitle')}
          onClose={() => setBookmarkFor(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setBookmarkFor(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="tip-note-form" className="btn btn-primary" disabled={savingNote}>
                {savingNote && <span className="spinner" aria-hidden="true" />}
                {t('ui.save')}
              </button>
            </>
          }
        >
          <form id="tip-note-form" onSubmit={saveNote}>
            <p className="smallish muted">“{bookmarkFor.text}”</p>
            <FormField label={t('tip.noteLabel')} htmlFor="tip-note" help={t('tip.noteHelp')}>
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
