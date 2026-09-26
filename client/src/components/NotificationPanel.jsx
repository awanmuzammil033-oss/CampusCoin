import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';
import { uiLang, dayLabel } from '../dates.js';

/**
 * The notification panel (BUD-3's front door).
 *
 * One component, used twice: as the popover behind the bell, and as the full
 * page. Both read the same feed, filter the same way, and mark the same rows -
 * so a fix to "mark as read" cannot land on one and miss the other.
 *
 * Three decisions worth stating:
 *
 *  - A campus notice is not a personal row. It is stored once for everybody, so
 *    it has no read state: no unread dot, no toggle, and a "campus" tag that
 *    says why. An unread dot that can never be cleared is a lie about the state
 *    of the list.
 *  - Marking as read is reversible. People clear a warning before they have
 *    done anything about it, and putting it back should not need a database
 *    tool.
 *  - The count is announced. A screen reader should hear "3 unread" when the
 *    bell changes, not just see a number appear.
 */

/** Which emoji a row gets, and whether it can be marked. */
function shapeOf(row) {
  const isCampus = String(row.id).startsWith('ann-');
  if (isCampus) return { icon: 'megaphone', tone: 'campus', canToggle: false };
  if (row.kind === 'budget_exceeded') return { icon: 'ban', tone: 'danger', canToggle: true };
  if (row.kind === 'budget_near') return { icon: 'warning', tone: 'warn', canToggle: true };
  return { icon: 'info', tone: 'plain', canToggle: true };
}

/** "just now", "12 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(value, t) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return t('noti.justNow');
  if (minutes < 60) return t('noti.minutesAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('noti.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('noti.daysAgo', { n: days });
  return dayLabel(value);
}

/**
 * The data behind the panel: the feed, the unread count, and the two actions.
 * Kept out of the view so the popover and the page cannot drift apart.
 */
export function useNotifications({ limit = 40 } = {}) {
  const { t } = useLocale();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/notifications');
      if (!alive.current) return;
      setRows((data.rows || []).slice(0, limit));
      setUnread(data.unread || 0);
      setError('');
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Read or unread, whichever it is not. Optimistic, and rolled back on failure. */
  const setRead = useCallback(
    async (row, isRead) => {
      const { canToggle } = shapeOf(row);
      if (!canToggle || row.isRead === isRead) return;
      const before = rows;
      setRows((list) => list.map((r) => (r.id === row.id ? { ...r, isRead } : r)));
      setUnread((n) => Math.max(0, n + (isRead ? -1 : 1)));
      try {
        const saved = await api.patch(`/api/notifications/${row.id}`, { isRead });
        if (alive.current && typeof saved.unread === 'number') setUnread(saved.unread);
        toast.push(t(isRead ? 'noti.markedRead' : 'noti.markedUnread'), 'success');
      } catch (err) {
        if (!alive.current) return;
        setRows(before);
        setUnread((n) => Math.max(0, n + (isRead ? 1 : -1)));
        toast.push(err.message, 'error');
      }
    },
    [rows, t, toast]
  );

  const markAll = useCallback(async () => {
    if (unread === 0) return;
    try {
      await api.post('/api/notifications/read-all');
      setRows((list) => list.map((r) => (shapeOf(r).canToggle ? { ...r, isRead: true } : r)));
      setUnread(0);
      toast.push(t('noti.markedAll'), 'success');
    } catch (err) {
      toast.push(err.message, 'error');
    }
  }, [unread, t, toast]);

  return { rows, unread, loading, error, refresh, setRead, markAll };
}

/* --------------------------------- the rows --------------------------------- */

function Row({ row, onToggle }) {
  const { t } = useLocale();
  const { icon, tone, canToggle } = shapeOf(row);
  const when = timeAgo(row.createdAt, t);

  const body = (
    <>
      <span className={`cc-note-ico cc-note-${tone}`} aria-hidden="true">
        <Icon name={icon} size={17} />
      </span>
      <span className="cc-note-text">
        <span className="cc-note-msg">{row.message}</span>
        <span className="cc-note-when">
          {when}
          {row.source === 'campus' && <span className="cc-note-tag">{t('noti.campusTag')}</span>}
        </span>
      </span>
    </>
  );

  return (
    <li className={`cc-note-row ${row.isRead && canToggle ? 'cc-note-row-read' : ''}`}>
      {canToggle ? (
        <button
          type="button"
          className="cc-note cc-note-clickable"
          onClick={() => onToggle(row, !row.isRead)}
          aria-pressed={row.isRead}
        >
          {body}
        </button>
      ) : (
        <div className="cc-note cc-note-static">{body}</div>
      )}

      {canToggle && (
        <span className="cc-note-actions">
          {!row.isRead && <span className="cc-note-dot" aria-hidden="true" />}
          <button
            type="button"
            className="cc-note-toggle"
            onClick={() => onToggle(row, !row.isRead)}
            aria-pressed={row.isRead}
            aria-label={row.isRead ? t('noti.markUnread') : t('noti.markRead')}
            title={row.isRead ? t('noti.markUnread') : t('noti.markRead')}
          >
            <Icon name={row.isRead ? 'undo' : 'check'} size={15} />
          </button>
        </span>
      )}

      {canToggle && (row.kind === 'budget_near' || row.kind === 'budget_exceeded') && (
        <Link className="cc-note-go" to="/budgets" aria-label={t('noti.openBudgets')} title={t('noti.openBudgets')}>
          <Icon name="arrowRight" size={15} />
        </Link>
      )}
    </li>
  );
}

/* -------------------------------- the panel -------------------------------- */

export function NotificationPanel({
  rows,
  unread,
  loading,
  error,
  onToggle,
  onMarkAll,
  onClose,
  showFilters = true,
  showFooter = true,
  emptyExtra = null,
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState('all');

  const shown = filter === 'unread' ? rows.filter((r) => shapeOf(r).canToggle && !r.isRead) : rows;
  const unreadCount = rows.filter((r) => shapeOf(r).canToggle && !r.isRead).length;

  return (
    <div className="cc-noti" role="dialog" aria-label={t('topbar.notifications')}>
      <div className="cc-noti-head">
        <div className="cc-noti-head-text">
          <strong>{t('topbar.notifications')}</strong>
          <span className="cc-noti-count" aria-live="polite">
            {unreadCount > 0 ? t('noti.unreadCount', { n: unreadCount }) : t('noti.allClear')}
          </span>
        </div>
        <div className="cc-noti-head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onMarkAll}
            disabled={unreadCount === 0}
          >
            <Icon name="checkCircle" size={15} /> {t('topbar.markAllRead')}
          </button>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('ui.close')}>
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="cc-noti-filters" role="tablist">
          {[
            { id: 'all', label: t('noti.filterAll'), n: rows.length },
            { id: 'unread', label: t('noti.filterUnread'), n: unreadCount },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={`cc-noti-tab ${filter === tab.id ? 'active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label} <span className="cc-noti-tab-n num">{tab.n}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="cc-noti-error smallish" role="alert">
          <Icon name="warning" size={15} /> {error}
        </p>
      )}

      {loading && (
        <div className="cc-noti-skeleton" aria-hidden="true">
          <span className="skeleton" style={{ height: 34 }} />
          <span className="skeleton" style={{ height: 34 }} />
          <span className="skeleton" style={{ height: 34 }} />
        </div>
      )}

      {!loading && shown.length === 0 && (
        <div className="cc-noti-empty">
          <span className="cc-noti-empty-ico" aria-hidden="true">
            <Icon name="bell" size={22} />
          </span>
          <p className="mb-0">
            {filter === 'unread' ? t('noti.noneUnread') : t('topbar.nothingNew')}
          </p>
          {emptyExtra}
        </div>
      )}

      {!loading && shown.length > 0 && (
        <ul className="cc-noti-list">
          {shown.map((row) => (
            <Row key={row.id} row={row} onToggle={onToggle} />
          ))}
        </ul>
      )}

      {showFooter && (
        <div className="cc-noti-foot">
          <Link to="/notifications" className="btn btn-ghost btn-sm w-100" onClick={onClose}>
            {t('topbar.allNotifications')}
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * The bell and the panel it opens. The count badge is the only thing this
 * component owns beyond the open/closed state, and it is marked aria-live so
 * the change is announced rather than only seen.
 */
export function NotificationBell({ onOpenChange }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const { rows, unread, loading, error, refresh, setRead, markAll } = useNotifications({ limit: 12 });

  // Re-read when the panel is opened: a nudge that arrived while the tab was in
  // the background should be there, not on the next page load.
  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="position-relative" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t('topbar.notifications')}${unread ? `, ${unread} ${t('topbar.unread')}` : ''}`}
      >
        <Icon name="bell" />
        {unread > 0 && <span className="badge-count">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="cc-popover cc-popover-notifications">
          <NotificationPanel
            rows={rows}
            unread={unread}
            loading={loading}
            error={error}
            onToggle={setRead}
            onMarkAll={markAll}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export default NotificationPanel;
