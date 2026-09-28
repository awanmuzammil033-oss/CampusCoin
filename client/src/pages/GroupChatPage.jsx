import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import FormField from '../components/FormField.jsx';
import { MessageList, CategorySheet, PollForm } from '../components/GroupChat.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { useAuth } from '../auth.jsx';

/**
 * The group's own thread (GRP-CHAT), and the one place a group asks a money
 * question out loud: "chai at 4pm, 350 per head — who's in?". The question is
 * posted as a message, every member ticks themselves in or out, and the running
 * total is the number the server sends back — the page never multiplies a rate
 * by a count of its own.
 *
 * The page owns the data and the requests. The message list, the bubble, the
 * poll card, the avatar, the category sheet and the poll form live in
 * components/GroupChat.jsx, so this file reads as fetch → state → render.
 *
 * Colours never carry the meaning on their own: "in", "out" and "waiting" each
 * travel with a word and a glyph (design.md §3).
 */

/** Which row is mine: the server says so, and the account id is the fallback. */
function myMemberIndex(members, userId) {
  const flagged = members.find((member) => member.isYou);
  if (flagged) return flagged.index;
  const found = members.find((member) => member.user && member.user === userId);
  return found ? found.index : -1;
}

export default function GroupChatPage() {
  const { t, plural, ledgerCurrency } = useLocale();
  const { push } = useToast();
  const { user } = useAuth();
  const params = useParams();
  // Mounted as /groups/:groupId/chat. Reading `params.id` as well keeps the
  // screen working if the route is written the other way round.
  const groupId = params.groupId || params.id;

  const [data, setData] = useState(null); // { group, rows }

  /**
   * How many of this person's own writes are in flight right now.
   *
   * A number, not a boolean: a message can be going up while a poll tick is being
   * answered, and a boolean would drop its count and let a background read land
   * between the two - which is how a message you just sent blinks out and comes
   * back a few seconds later. A ref, because nothing renders from it.
   */
  const writing = useRef(0);

  /** A write is starting: the background poll steps aside until it finishes. */
  function beginWrite() {
    writing.current += 1;
  }

  /**
   * A write has finished, however it finished.
   *
   * The floor at zero is deliberate. A counter that could go negative would make
   * the guard in load() read "0 > -1", which is true, and the room would never
   * update again with nothing on screen to say why. Failing open - one lost
   * increment costs a few seconds of staleness, a stuck counter costs the feature.
   */
  function endWrite() {
    writing.current = Math.max(0, writing.current - 1);
  }
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);

  const [text, setText] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [draft, setDraft] = useState(null); // { category }
  const [postError, setPostError] = useState('');
  const [posting, setPosting] = useState(false);

  const [busyId, setBusyId] = useState(''); // the poll being answered
  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState('');
  const [removingBusy, setRemovingBusy] = useState(false);

  const sheetRef = useRef(null);

  /**
   * Read the thread.
   *
   * `quiet` is the background poll: a read that was not asked for must not change
   * what is on screen, so it neither clears an error, nor shows a toast, nor marks
   * the group as gone. A poll that lands while one of this person's own writes is
   * still in flight is DROPPED rather than merged - a message that has just been
   * posted may not blink out because a read that started before it arrived after
   * it. The next poll picks it up.
   */
  function load({ quiet = false } = {}) {
    if (quiet && writing.current > 0) return Promise.resolve();

    return api
      .get(`/api/groups/${groupId}/chat`)
      .then((res) => {
        const nextRows = res.rows || [];
        if (quiet && data?.rows) {
          const oldIds = new Set(data.rows.map((r) => r.id));
          const newIncoming = nextRows.filter((r) => !oldIds.has(r.id) && !r.isYou);
          if (newIncoming.length > 0) {
            const lastMsg = newIncoming[newIncoming.length - 1];
            const senderName = lastMsg.sender?.name || 'Member';
            const grpName = res.group?.name || 'Group';
            push(
              t('noti.groupMessage', {
                groupName: grpName,
                senderName,
                text: lastMsg.text || (lastMsg.poll ? `Poll: ${lastMsg.poll.purpose || 'New Poll'}` : 'New message'),
              }),
              'info'
            );
          }
        }
        setData({ group: res.group || {}, rows: nextRows });
        if (quiet) return;
        setError('');
        setGone(false);
      })
      .catch((err) => {
        if (quiet) return;
        // A 404 or 403 here is the server's way of saying "you are not in this
        // group, or it is gone" — a different answer from "try again in a
        // moment", and one the screen explains in full below, so it is not
        // repeated as a toast on top of that.
        const lost = err.status === 404 || err.status === 403;
        setError(err.message);
        if (lost) setGone(true);
        else push(err.message, 'error');
      });
  }

  /**
   * How often a quiet read happens, and the reason for the number: seven seconds
   * is long enough not to be a stream of requests and short enough that a message
   * still feels like it arrived. A poll that finds nothing changes nothing at all.
   */
  const POLL_EVERY_MS = 7000;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, push]);

  /**
   * The poll, and the four things it must not do.
   *
   * It runs only while the tab is on screen; it says nothing when it fails; it is
   * dropped while one of this person's own writes is in flight; and it never moves
   * the scroll unless the reader was already at the bottom. The interval is
   * cleared when the room is left, so nothing keeps running behind a page that is
   * no longer there.
   */
  useEffect(() => {
    let timer = 0;

    const tick = () => {
      if (document.visibilityState === 'visible' && !document.hidden) {
        // the reader scrolled up to re-read something: do not follow the thread
        // down and take their place away from them
        const near = window.innerHeight + window.scrollY >= document.body.offsetHeight - 120;
        if (near) load({ quiet: true });
      }
      timer = window.setTimeout(tick, POLL_EVERY_MS);
    };

    timer = window.setTimeout(tick, POLL_EVERY_MS);
    const wake = () => {
      // straight back to the tab: one read now, rather than waiting out the timer
      if (document.visibilityState === 'visible') load({ quiet: true });
    };
    document.addEventListener('visibilitychange', wake);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, push]);

  // The sheet is a popover, so it closes the way the bell's and the account
  // menu's do: Escape, or a click anywhere outside it.
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onDown = (event) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target)) setSheetOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [sheetOpen]);

  function append(message) {
    if (!message) return;
    setData((prev) => (prev ? { ...prev, rows: [...prev.rows, message] } : prev));
  }

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body) {
      setSendError(t('chat.needMessage'));
      return;
    }
    setSending(true);
    beginWrite();
    try {
      const res = await api.post(`/api/groups/${groupId}/chat/messages`, { text: body });
      setText('');
      setSendError('');
      append(res.message);
    } catch (err) {
      setSendError(err.message);
    } finally {
      endWrite();
      setSending(false);
    }
  }

  /**
   * One tick. Tapping the answer you already gave takes it back, so the
   * client sends null for that case: the server accepts it and the row comes
   * back as pending. Everything else goes up as the value of the button that
   * was tapped, and the message that comes back replaces the row whole - the
   * server cleared the answer, counted the tick and worked out the total, so
   * nothing here is added up by hand.
   */
  async function respond(messageId, yes) {
    const current = data?.rows
      ?.find((row) => row.id === messageId)
      ?.poll?.responses?.find((row) => row.memberIndex === myIndex)?.yes;
    const next = current === yes ? null : yes;
    if (busyId) return;
    setBusyId(messageId);
    beginWrite();
    try {
      const res = await api.patch(`/api/groups/${groupId}/chat/polls/${messageId}/respond`, { yes: next });
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((row) => (row.id === messageId && res.message ? res.message : row)),
            }
          : prev
      );
    } catch (err) {
      push(err.message, 'error');
    } finally {
      endWrite();
      setBusyId('');
    }
  }

  function pickCategory(category) {
    setSheetOpen(false);
    setPostError('');
    setDraft({ category });
  }

  async function postPoll(values) {
    setPosting(true);
    setPostError('');
    beginWrite();
    try {
      const res = await api.post(`/api/groups/${groupId}/chat/polls`, {
        category: draft.category,
        location: values.location.trim(),
        purpose: values.purpose.trim(),
        date: values.date || '',
        time: values.time || '',
        rate: String(values.rate).trim(),
        note: values.note.trim(),
      });
      setDraft(null);
      push(t('chat.pollPosted'));
      append(res.message);
    } catch (err) {
      setPostError(err.message);
    } finally {
      endWrite();
      setPosting(false);
    }
  }

  async function removeMessage() {
    const target = removing;
    if (!target) return;
    setRemovingBusy(true);
    setRemoveError('');
    beginWrite();
    try {
      await api.del(`/api/groups/${groupId}/chat/messages/${target.id}`);
      setRemoving(null);
      push(t('chat.deleted'));
      setData((prev) => (prev ? { ...prev, rows: prev.rows.filter((row) => row.id !== target.id) } : prev));
    } catch (err) {
      setRemoveError(err.message);
    } finally {
      endWrite();
      setRemovingBusy(false);
    }
  }

  /* ------------------------------------------------------------- the frame -- */

  const backLink = (
    <Link className="icon-btn" to="/groups" aria-label={t('chat.back')} title={t('chat.back')}>
      <Icon name="arrowLeft" />
    </Link>
  );

  function shell(body) {
    const name = data?.group?.name;
    const count = data?.group?.members?.length || 0;
    return (
      <Page
        trail={[{ label: t('chat.title'), to: '/groups' }, { label: name || t('chat.notAvailable') }]}
        title={name || t('chat.title')}
        subtitle={data ? plural('chat.members', count, { n: count }) : undefined}
        actions={backLink}
      >
        {body}
      </Page>
    );
  }

  /* ------------------------------------------------------- the odd states -- */

  // Not a member, or the group is gone: say so in words and offer the way back,
  // rather than an empty box that looks like a quiet chat.
  if (gone || !groupId) {
    return (
      <Page
        trail={[{ label: t('chat.title'), to: '/groups' }, { label: t('chat.notAvailable') }]}
        title={t('chat.title')}
        actions={backLink}
      >
        <div className="card">
          <EmptyState
            icon="users"
            title={t('chat.goneTitle')}
            action={
              <Link className="btn btn-secondary mt-2" to="/groups">
                {t('chat.back')}
              </Link>
            }
          >
            {t('chat.goneBody')}
          </EmptyState>
        </div>
      </Page>
    );
  }

  if (!data && error) {
    return (
      <Page
        trail={[{ label: t('chat.title'), to: '/groups' }, { label: t('chat.notAvailable') }]}
        title={t('chat.title')}
        actions={backLink}
      >
        <div className="card">
          <EmptyState
            icon="warning"
            title={t('chat.errorTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={load}>
                {t('chat.retry')}
              </button>
            }
          >
            {error}
          </EmptyState>
        </div>
      </Page>
    );
  }

  if (!data) {
    return shell(
      <div className="card" role="status">
        <div className="skeleton" style={{ height: 48, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 48, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 48 }} />
        <p className="smallish muted mb-0 mt-3">{t('chat.loading')}</p>
      </div>
    );
  }

  /* ----------------------------------------------------------- the screen -- */

  const group = data.group;
  const rows = data.rows;
  const currency = group.currency || ledgerCurrency || '';
  const myIndex = myMemberIndex(group.members || [], user?.id);

  return shell(
    <>
      <p className="smallish muted">
        <Icon name="info" /> {t('chat.howItWorks')}
      </p>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
            {t('chat.retry')}
          </button>
        </div>
      )}

      <div className="card cc-chat" style={{ padding: 12 }}>
        <MessageList
          rows={rows}
          group={group}
          myIndex={myIndex}
          busyId={busyId}
          onRespond={respond}
          onDelete={(message) => {
            setRemoveError('');
            setRemoving(message);
          }}
        />

        <form
          className="cc-composer"
          onSubmit={send}
          noValidate
          style={{ borderTop: '1px solid var(--cc-border)', marginTop: 12, paddingTop: 12 }}
        >
          {sendError && (
            <div className="field-error mb-2" role="alert">
              <Icon name="warning" size={16} />
              <span>{sendError}</span>
            </div>
          )}

          <FormField label={t('chat.composerLabel')} htmlFor="chat-composer">
            {(a) => (
              // no wrap: the three controls hold one line down to 360px, and the
              // input is the only one that gives ground (min-width 0).
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="position-relative" ref={sheetRef} style={{ flex: '0 0 auto' }}>
                  <button
                    type="button"
                    className="icon-btn cc-composer-more"
                    onClick={() => setSheetOpen((open) => !open)}
                    aria-expanded={sheetOpen}
                    aria-haspopup="dialog"
                    aria-label={t('chat.moreAria')}
                    title={t('chat.moreTitle')}
                  >
                    <Icon name="plus" />
                  </button>
                  {sheetOpen && <CategorySheet onPick={pickCategory} />}
                </div>

                <input
                  id="chat-composer"
                  className="input"
                  type="text"
                  maxLength={1000}
                  autoComplete="off"
                  placeholder={t('chat.composerPlaceholder')}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  style={{ flex: '1 1 140px', minWidth: 0 }}
                  {...a}
                />

                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: '0 0 auto' }}>
                  {sending && <span className="spinner" aria-hidden="true" />}
                  {t('ui.send')}
                </button>
              </div>
            )}
          </FormField>
        </form>
      </div>

      {draft && (
        <PollForm
          category={draft.category}
          currency={currency}
          saving={posting}
          error={postError}
          onClose={() => setDraft(null)}
          onSubmit={postPoll}
        />
      )}

      {removing && (
        <Modal
          title={t('chat.deleteTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeMessage} disabled={removingBusy}>
                {removingBusy && <span className="spinner" aria-hidden="true" />}
                {t('chat.deleteBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">{t('chat.deleteBody')}</p>
          {removeError && (
            <div className="field-error mt-3" role="alert">
              <Icon name="warning" size={16} />
              <span>{removeError}</span>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
