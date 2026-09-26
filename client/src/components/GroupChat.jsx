import { useEffect, useRef, useState } from 'react';

import EmptyState from './EmptyState.jsx';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import { useLocale } from '../locale.jsx';
import { dayLabel, uiLang } from '../dates.js';
import { getLedgerCurrency, money } from '../money.js';

/**
 * The pieces of the group chat, kept out of the page so the page reads as
 * fetch → state → render: the message log, a text bubble, the poll card with
 * its per-person ticks, the member avatar, the "+" category sheet and the poll
 * form. Nothing in here talks to the API.
 *
 * Three rules keep it honest:
 *
 *  - every visible string comes from the dictionary, so the screen follows the
 *    language the student picked;
 *  - a member's colour is a hash of their name into six surfaces that already
 *    exist in both themes — the same person is the same colour on every render,
 *    in this screen and the next one, and never a random colour per paint;
 *  - the three tick states (waiting / in / out) each carry a word as well as a
 *    glyph and a colour, because colour alone is never the message
 *    (design.md §3, and the promise in the ReadMe about status).
 */

/* ---------------------------------------------------------------- the data -- */

/**
 * The six things a group actually splits. `id` is what the API stores; the
 * label and the glyph live here so the sheet, the form and the card can never
 * drift apart.
 */
const CATEGORIES = [
  // the last entry is also the fallback for a category this build does not know
  { id: 'chai', icon: 'cup', labelKey: 'chat.category.chai' },
  { id: 'transport', icon: 'bus', labelKey: 'chat.category.transport' },
  { id: 'food', icon: 'burger', labelKey: 'chat.category.food' },
  { id: 'outing', icon: 'film', labelKey: 'chat.category.outing' },
  { id: 'shopping', icon: 'gift', labelKey: 'chat.category.shopping' },
  { id: 'other', icon: 'dots', labelKey: 'chat.category.other' },
];

const OTHER = CATEGORIES[CATEGORIES.length - 1];

/** A category the server names that this build does not know still draws. */
function categoryOf(id) {
  return CATEGORIES.find((row) => row.id === id) || OTHER;
}

/**
 * Six surfaces that are already in both themes, so an avatar looks native
 * whatever the visitor picked — no palette of our own to keep in step.
 */
const AVATAR_TONES = [
  { bg: 'var(--cc-primary-soft)', fg: 'var(--cc-primary)' },
  { bg: 'var(--cc-accent-soft)', fg: 'var(--cc-warning)' },
  { bg: 'var(--cc-income-soft)', fg: 'var(--cc-income)' },
  { bg: 'var(--cc-expense-soft)', fg: 'var(--cc-expense)' },
  { bg: 'var(--cc-danger-soft)', fg: 'var(--cc-danger)' },
  { bg: 'var(--cc-surface-2)', fg: 'var(--cc-muted)' },
];

/** The two tick states that mean something, and the one that means "not yet". */
const TICK_ON = {
  yes: { bg: 'var(--cc-income-soft)', fg: 'var(--cc-income)' },
  no: { bg: 'var(--cc-danger-soft)', fg: 'var(--cc-danger)' },
};

function initialsOf(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

/** FNV-1a over the name — a plain string hash, so the colour never moves. */
function toneIndex(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % AVATAR_TONES.length;
}

function localDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Under a bubble: the clock for today's messages, the day and the clock for
 * older ones — the app's own date vocabulary, in the chosen language.
 */
export function timeLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const clock = d.toLocaleTimeString(uiLang(), { hour: '2-digit', minute: '2-digit' });
  const day = localDay(d);
  if (!day) return clock;
  return day === localDay(new Date()) ? clock : `${dayLabel(day)} · ${clock}`;
}

/**
 * A poll carries a plain "16:00". Read it in the reader's own clock (12-hour
 * for en, 24-hour nearly everywhere else) and fall back to the raw string when
 * the API ever sends a phrase instead.
 */
export function clockLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return text;
  const when = new Date(2000, 0, 1, Number(match[1]), Number(match[2]), 0);
  if (Number.isNaN(when.getTime())) return text;
  return when.toLocaleTimeString(uiLang(), { hour: '2-digit', minute: '2-digit' });
}

/**
 * A group keeps its own currency, which is usually the student's ledger
 * currency — then money() is exactly right, display conversion included. A
 * group in some other currency must NOT be converted from the ledger, so it is
 * formatted in its own code rather than relabelled as if it were the same.
 * (Same rule, and the same helper, as GroupsPage.)
 */
export function groupAmount(value, currency) {
  const n = Number(value) || 0;
  if (currency === getLedgerCurrency()) return money(n);
  const sign = n < 0 ? '\u2212' : '';
  try {
    const text = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(n));
    return `${sign}${text}`;
  } catch {
    return `${sign}${currency} ${Math.abs(n).toFixed(2)}`;
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* --------------------------------------------------------------- the avatar -- */

export function Avatar({ name, initials, size = 32 }) {
  const text = initials || initialsOf(name);
  const tone = AVATAR_TONES[toneIndex(name || text || '?')];
  return (
    <span
      className="cc-avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: tone.bg,
        color: tone.fg,
        fontWeight: 700,
        lineHeight: 1,
        fontSize: Math.max(11, Math.round(size * 0.4)),
      }}
    >
      {text || '?'}
    </span>
  );
}

/* ------------------------------------------------------------ the log ------- */

export function MessageList({ rows, group, myIndex, busyId, onRespond, onDelete }) {
  const { t } = useLocale();
  const boxRef = useRef(null);
  const stickRef = useRef(true);

  // A chat that opens on the oldest line is a chat nobody reads, so the log
  // follows the newest message — but only while the reader is already at the
  // bottom, so scrolling up to read history is never yanked away.
  useEffect(() => {
    const box = boxRef.current;
    if (box && stickRef.current) box.scrollTop = box.scrollHeight;
  }, [rows]);

  function onScroll(event) {
    const box = event.currentTarget;
    stickRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 56;
  }

  return (
    // role="log" is a polite live region: a message that arrives is announced in
    // order, and a total that moves is a text change inside it, so one region
    // covers both without two live regions talking over each other.
    <div
      className="cc-chat-log"
      ref={boxRef}
      onScroll={onScroll}
      role="log"
      aria-label={t('chat.logAria')}
    >
      {rows.length === 0 ? (
        <EmptyState icon="send" title={t('chat.emptyTitle')}>
          {t('chat.emptyBody')}
        </EmptyState>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {rows.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              group={group}
              myIndex={myIndex}
              busy={busyId === message.id}
              onRespond={onRespond}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One message: avatar and name on the outside, bubble and clock on the inside. */
function MessageRow({ message, group, myIndex, busy, onRespond, onDelete }) {
  const { t } = useLocale();
  const mine = Boolean(message.isYou);
  const sender = message.sender || {};
  const isPoll = message.kind === 'poll';

  return (
    <li
      className="cc-msg"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        // flex-end follows the writing direction, so "mine" stays on the reader's
        // own side in every language.
        justifyContent: mine ? 'flex-end' : 'flex-start',
      }}
    >
      {!mine && <Avatar name={sender.name} initials={sender.initials} size={30} />}

      <div
        style={{
          minWidth: 0,
          maxWidth: isPoll ? 'min(94%, 560px)' : 'min(80%, 460px)',
          display: 'grid',
          gap: 4,
        }}
      >
        {!mine && (
          <span className="smallish muted cc-msg-name" style={{ overflowWrap: 'anywhere' }}>
            {sender.name}
          </span>
        )}

        {isPoll ? (
          <PollCard message={message} group={group} myIndex={myIndex} busy={busy} onRespond={onRespond} />
        ) : (
          <TextBubble text={message.text} mine={mine} />
        )}

        <div
          className="cc-msg-foot"
          style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}
        >
          <span className="smallish muted num">{timeLabel(message.createdAt)}</span>
          {mine && (
            <button
              type="button"
              className="btn btn-ghost btn-sm cc-msg-del"
              onClick={() => onDelete(message)}
              aria-label={isPoll ? t('chat.deletePollAria') : t('chat.deleteAria')}
              title={isPoll ? t('chat.deletePollAria') : t('chat.deleteAria')}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>

      {mine && <Avatar name={sender.name} initials={sender.initials} size={30} />}
    </li>
  );
}

function TextBubble({ text, mine }) {
  return (
    <div
      className="cc-bubble"
      style={{
        background: mine ? 'var(--cc-primary-soft)' : 'var(--cc-surface-2)',
        border: '1px solid var(--cc-border)',
        borderRadius: 'var(--cc-radius-card)',
        padding: '8px 12px',
        overflowWrap: 'anywhere',
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </div>
  );
}

/* ----------------------------------------------------------- the poll card -- */

function PollCard({ message, group, myIndex, busy, onRespond }) {
  const { t } = useLocale();
  const poll = message.poll || {};
  const currency = group?.currency || '';
  const members = group?.members || [];
  const category = categoryOf(poll.category);
  const yes = Number(poll.yesCount) || 0;
  const no = Number(poll.noCount) || 0;
  const pending = Number(poll.pendingCount) || 0;
  const nameAt = (index) => members.find((member) => member.index === index)?.name || '';
  const answer = (value) => onRespond(message.id, value);

  return (
    <article
      className="cc-poll"
      style={{
        background: 'var(--cc-surface)',
        border: '1px solid var(--cc-border)',
        borderRadius: 'var(--cc-radius-card)',
        padding: 12,
      }}
    >
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="txn-ico" style={{ width: 30, height: 30, fontSize: '1rem' }}>
          <Icon name={category.icon} />
        </span>
        <strong style={{ fontSize: '0.9375rem' }}>{t(category.labelKey)}</strong>
      </div>

      {poll.purpose && (
        <p className="cc-poll-what" style={{ margin: '8px 0 0', fontWeight: 600, overflowWrap: 'anywhere' }}>
          {poll.purpose}
        </p>
      )}
      {message.text && (
        <p className="smallish muted" style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>
          {message.text}
        </p>
      )}

      <div className="cc-poll-facts" style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        {poll.location && <Fact icon="pin" text={poll.location} />}
        {poll.date && <Fact icon="calendar" text={dayLabel(poll.date)} />}
        {poll.time && <Fact icon="clock" text={clockLabel(poll.time)} />}
      </div>

      {/* The total is the server's number and nothing here is added up. */}
      <div
        className="cc-poll-total"
        style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 10 }}
      >
        <span className="num" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
          {groupAmount(poll.total, currency)}
        </span>
        <span className="smallish muted">{t('chat.totalLabel')}</span>
      </div>
      <p className="smallish muted" style={{ margin: '2px 0 0' }}>
        {t('chat.rateEach', { amount: groupAmount(poll.rate, currency) })}
      </p>

      <div
        className="cc-poll-roster"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--cc-border)',
        }}
      >
        <strong className="smallish">{t('chat.whosIn')}</strong>
        <span className="smallish muted num">{t('chat.tally', { yes, no, pending })}</span>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {(poll.responses || []).map((row) => (
          <PollRow
            key={row.memberIndex}
            row={row}
            name={nameAt(row.memberIndex) || row.name}
            mine={row.memberIndex === myIndex}
            busy={busy}
            onAnswer={answer}
          />
        ))}
      </ul>

      {poll.note && (
        <p className="smallish muted" style={{ margin: '8px 0 0', overflowWrap: 'anywhere' }}>
          {poll.note}
        </p>
      )}
      {myIndex >= 0 && (
        <p className="smallish muted" style={{ margin: '8px 0 0' }}>
          <Icon name="info" size={14} /> {t('chat.yourTurn')}
        </p>
      )}
    </article>
  );
}

function Fact({ icon, text }) {
  return (
    <span className="smallish d-inline-flex align-items-center gap-1" style={{ minWidth: 0 }}>
      <Icon name={icon} size={14} />
      <span style={{ overflowWrap: 'anywhere' }}>{text}</span>
    </span>
  );
}

/**
 * One member's answer.
 *
 * The row is the tick, not a wrapper around it: the ✔ button carries the avatar,
 * the name and the state word, so most of the row is the target, and the ❌ sits
 * at the end of it. Everybody else's row is the same drawing with spans instead
 * of buttons — it shows the state, it does not pretend to be clickable.
 */
function PollRow({ row, name, mine, busy, onAnswer }) {
  const { t } = useLocale();
  const state = row.yes === true ? 'in' : row.yes === false ? 'out' : 'waiting';
  const word = state === 'in' ? t('chat.in') : state === 'out' ? t('chat.out') : t('chat.waiting');
  const tone = state === 'in' ? 'var(--cc-income)' : state === 'out' ? 'var(--cc-danger)' : 'var(--cc-muted)';

  const who = (
    <>
      <Avatar name={name} initials={row.initials} size={28} />
      <span style={{ minWidth: 0, flex: '1 1 auto', textAlign: 'start' }}>
        <span
          className="cc-poll-name"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span className="smallish" style={{ display: 'block', color: tone, fontWeight: 600 }}>
          {word}
        </span>
      </span>
    </>
  );

  const box = {
    border: '1px solid var(--cc-border)',
    borderRadius: 'var(--cc-radius)',
    minHeight: 36,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
  };

  return (
    <li className="cc-poll-row" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }} aria-busy={busy}>
      {mine ? (
        <>
          <button
            type="button"
            className="btn btn-sm cc-tick"
            aria-pressed={row.yes === true}
            aria-label={t('chat.yesAria', { name })}
            disabled={busy}
            onClick={() => onAnswer(true)}
            style={{
              ...box,
              flex: '1 1 auto',
              minWidth: 0,
              justifyContent: 'flex-start',
              fontFamily: 'inherit',
              cursor: 'pointer',
              background: row.yes === true ? TICK_ON.yes.bg : 'var(--cc-surface)',
              color: row.yes === true ? TICK_ON.yes.fg : 'var(--cc-muted)',
            }}
          >
            {who}
            <Icon name="check" size={16} />
          </button>
          <button
            type="button"
            className="btn btn-sm cc-tick"
            aria-pressed={row.yes === false}
            aria-label={t('chat.noAria', { name })}
            disabled={busy}
            onClick={() => onAnswer(false)}
            style={{
              ...box,
              minWidth: 36,
              justifyContent: 'center',
              padding: 4,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              background: row.yes === false ? TICK_ON.no.bg : 'var(--cc-surface)',
              color: row.yes === false ? TICK_ON.no.fg : 'var(--cc-muted)',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </>
      ) : (
        <>
          <span
            className="cc-tick-static"
            style={{ ...box, flex: '1 1 auto', minWidth: 0, background: row.yes === true ? TICK_ON.yes.bg : 'var(--cc-surface)' }}
          >
            {who}
            <span
              style={{
                color: row.yes === true ? TICK_ON.yes.fg : 'var(--cc-muted)',
                fontWeight: 700,
                display: 'inline-flex',
              }}
            >
              <Icon name="check" size={16} />
            </span>
          </span>
          <span
            className="cc-tick-static"
            style={{
              ...box,
              minWidth: 36,
              justifyContent: 'center',
              padding: 4,
              fontWeight: 700,
              background: row.yes === false ? TICK_ON.no.bg : 'var(--cc-surface)',
              color: row.yes === false ? TICK_ON.no.fg : 'var(--cc-muted)',
            }}
          >
            <Icon name="close" size={16} />
          </span>
        </>
      )}
    </li>
  );
}

/* ---------------------------------------------------------- the + and the form -- */

/**
 * The category sheet, anchored to the "+" button beside the composer.
 *
 * A popover, not a Modal, and deliberately so. It reuses .cc-popover — the same
 * skin the notification bell and the account menu already open, so it inherits
 * their cap, their border and their z-index and cannot drift from them. A Modal
 * is for a decision or a form that deserves the whole screen; this is a
 * six-item menu, and the messages behind it are the reason the student pressed
 * "+" at all. It opens upwards because the "+" sits at the bottom of the log.
 *
 * The arrow of .cc-popover points down, so it is turned here; campuscoin.css
 * owns .cc-chat-sheet for that one rule.
 */
export function CategorySheet({ onPick }) {
  const { t } = useLocale();
  return (
    <div
      className="cc-popover cc-chat-sheet"
      role="dialog"
      aria-label={t('chat.pickCategory')}
      // anchored to the "+" at the start of the composer row: it opens upwards
      // (the composer is at the foot of the log) and to the right (the button
      // is at the left edge, so right-anchoring would hang off a 360px screen).
      style={{
        top: 'auto',
        bottom: 'calc(100% + 10px)',
        right: 'auto',
        left: 0,
        width: 'min(320px, calc(100vw - 24px))',
        maxHeight: 'min(60vh, 420px)',
        overflowY: 'auto',
        padding: 6,
      }}
    >
      <p className="smallish muted" style={{ margin: 0, padding: '6px 10px 4px' }}>
        {t('chat.pickCategory')}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {CATEGORIES.map((row) => (
          <li key={row.id}>
            <button type="button" className="dropdown-row" onClick={() => onPick(row.id)}>
              <span className="txn-ico" style={{ width: 30, height: 30, fontSize: '1rem' }}>
                <Icon name={row.icon} />
              </span>
              <span className="row-name" style={{ color: 'var(--cc-text)' }}>
                {t(row.labelKey)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The poll itself, in a Modal because it asks for six things: where, what for,
 * when, how much each, and a note. The chosen category is already locked in by
 * the sheet, so it is shown rather than asked again.
 */
export function PollForm({ category, currency, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const [form, setForm] = useState({
    location: '',
    purpose: '',
    date: todayISO(),
    time: '',
    rate: '',
    note: '',
  });
  const [bad, setBad] = useState('');

  function set(field, value) {
    setForm((row) => ({ ...row, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.location.trim()) {
      setBad(t('chat.needLocation'));
      return;
    }
    if (!form.purpose.trim()) {
      setBad(t('chat.needPurpose'));
      return;
    }
    if (!form.rate || Number(form.rate) <= 0) {
      setBad(t('chat.needRate'));
      return;
    }
    setBad('');
    onSubmit(form);
  }

  const picked = categoryOf(category);

  return (
    <Modal
      title={t('chat.pollTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="submit" form="chat-poll-form" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('chat.pollPost')}
          </button>
        </>
      }
    >
      <form id="chat-poll-form" onSubmit={submit} noValidate>
        <p className="d-flex align-items-center gap-2 flex-wrap smallish muted" style={{ marginBottom: 4 }}>
          <span className="txn-ico" style={{ width: 30, height: 30, fontSize: '1rem' }}>
            <Icon name={picked.icon} />
          </span>
          <strong style={{ color: 'var(--cc-text)' }}>{t(picked.labelKey)}</strong>
        </p>
        <p className="smallish muted">{t('chat.pollIntro')}</p>

        {(bad || error) && (
          <div className="field-error mb-3" role="alert">
            <Icon name="warning" size={16} />
            <span>{bad || error}</span>
          </div>
        )}

        <div className="row g-2">
          <div className="col-12 col-sm-8">
            <FormField label={t('chat.pollLocation')} htmlFor="chat-poll-location">
              {(a) => (
                <input
                  id="chat-poll-location"
                  className="input"
                  type="text"
                  maxLength={80}
                  autoComplete="off"
                  placeholder={t('chat.pollLocationPlaceholder')}
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>

          <div className="col-12 col-sm-4">
            <FormField label={t('ui.date')} htmlFor="chat-poll-date">
              {(a) => (
                <input
                  id="chat-poll-date"
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>

          <div className="col-12 col-sm-8">
            <FormField label={t('chat.pollPurpose')} htmlFor="chat-poll-purpose">
              {(a) => (
                <input
                  id="chat-poll-purpose"
                  className="input"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  placeholder={t('chat.pollPurposePlaceholder')}
                  value={form.purpose}
                  onChange={(e) => set('purpose', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>

          <div className="col-12 col-sm-4">
            <FormField label={t('chat.pollTime')} htmlFor="chat-poll-time">
              {(a) => (
                <input
                  id="chat-poll-time"
                  className="input"
                  type="time"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>

          <div className="col-12 col-sm-6">
            <FormField label={t('chat.pollRate')} htmlFor="chat-poll-rate" help={t('chat.pollRateHelp', { currency })}>
              {(a) => (
                <input
                  id="chat-poll-rate"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.rate}
                  onChange={(e) => set('rate', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>

          <div className="col-12 col-sm-6">
            <FormField label={t('chat.noteOptional')} htmlFor="chat-poll-note">
              {(a) => (
                <input
                  id="chat-poll-note"
                  className="input"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  placeholder={t('chat.pollNotePlaceholder')}
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
        </div>
      </form>
    </Modal>
  );
}
