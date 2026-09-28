import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useLocale } from '../locale.jsx';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';

/**
 * The joiner's side of a group invite — the screen a stranger reaches by
 * scanning a code on a noticeboard, before they have an account.
 *
 * WHY IT IS ADDRESSABLE
 * ---------------------
 * `/join/:token` is a real route rather than a sheet, because the person who
 * scans a poster is somebody standing in a corridor with a phone and no
 * history: a link they can be sent again, a refresh that keeps their place, and
 * a back button that has something to do.
 *
 * WHAT THE PREVIEW MAY SAY
 * ------------------------
 * It is read from `GET /api/invites/:token`, which needs no session — the one
 * route in the app that does not, because the person reading it is by
 * definition not signed in yet. That answer is three fields (a name, a
 * headcount, whether the code still works) and the server suite asserts that
 * key set exactly, so nothing about the group beyond its name can reach a
 * stranger's screen through this component. This file therefore has nothing to
 * render but those three facts.
 *
 * EVERY DEAD TOKEN LOOKS THE SAME HERE
 * -----------------------------------
 * `expired`, `revoked`, `unknown`, `already used`, and a group that has been
 * closed all arrive as one screen saying the link has expired. The component
 * does not branch on which of those it was, because the server does not say,
 * and a screen that could tell them apart would be a way of asking.
 *
 * THE CONFIRM IS EXPLICIT
 * -----------------------
 * Nothing is joined by opening this page. There is a button, the button says
 * what will happen, and the role is shown next to it — an invite is not a
 * promotion, and the owner can raise somebody afterwards with the editor that
 * already exists. That sentence is a dictionary key, not a hard-coded string.
 *
 * THE REF, NOT THE STATE
 * ----------------------
 * A double-tap of Confirm is the normal way a person uses a button on a phone.
 * The guard is a ref for the same reason QrPaySheet's paying guard is: two
 * clicks inside one tick would both read the old `joining` value. The server
 * refuses the second one cleanly regardless — the claim is atomic — but the
 * button should not be asking.
 */

const STAGE_LOADING = 'loading';
const STAGE_DEAD = 'dead';
const STAGE_CONFIRM = 'confirm';
const STAGE_DONE = 'done';

/**
 * The server's join-half codes, mapped to keys. Same rule as InviteQr: the
 * server never sends a sentence, and an unrecognised code falls back to a
 * generic key rather than showing a raw identifier.
 *
 * `alreadyMember` and `groupGone` are the two the component does NOT render as
 * a message, because for both of them the honest screen is the dead one: the
 * code has done its job and there is nothing left to retry.
 */
const REFUSAL_KEYS = new Set([
  'invite.expired',
  'invite.alreadyMember',
  'invite.groupFull',
  'invite.groupClosed',
  'invite.groupGone',
  'invite.liveExists',
  'invite.tooManyTries',
  'invite.noGroup',
  'invite.noInvite',
  'invite.noPermission',
  'invite.error',
]);

/** Codes the dead screen answers for, because retrying them is pointless. */
const DEAD_CODES = new Set(['invite.expired', 'invite.alreadyMember', 'invite.groupGone']);

/**
 * The code as a key, or the generic one. The server sends a code this build may
 * not know about, and a raw identifier is not something to show a student.
 */
function refusalKey(err) {
  return REFUSAL_KEYS.has(err?.code) ? err.code : 'invite.error';
}

function refusalVars(err) {
  return { waitMinutes: err?.waitMinutes, max: err?.max };
}

export default function JoinGroupPanel({ token: tokenProp }) {
  const { token: tokenFromUrl } = useParams();
  const navigate = useNavigate();
  const { t } = useLocale();
  const { user } = useAuth();
  const { push } = useToast();

  const token = tokenProp || tokenFromUrl;
  const [stage, setStage] = useState(STAGE_LOADING);
  const [preview, setPreview] = useState(null);
  const [joined, setJoined] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const busyRef = useRef(false);

  const read = useCallback(async () => {
    if (!token) {
      setStage(STAGE_DEAD);
      return;
    }
    setStage(STAGE_LOADING);
    try {
      const res = await api.get(`/api/invites/${token}`);
      if (res?.invite?.ok) {
        setPreview(res.invite);
        setStage(STAGE_CONFIRM);
      } else {
        setPreview(null);
        setStage(STAGE_DEAD);
      }
    } catch {
      setPreview(null);
      setStage(STAGE_DEAD);
    }
  }, [token]);

  useEffect(() => {
    read();
  }, [read]);

  async function confirm() {
    // the ref, not the state: two taps inside one tick would both see the old
    // `joining`, and this is a button people double-tap.
    if (busyRef.current || !token) return;
    busyRef.current = true;
    setJoining(true);
    setError('');
    try {
      const res = await api.post(`/api/invites/${token}/join`, {});
      setJoined(res.group);
      setStage(STAGE_DONE);
    } catch (err) {
      if (DEAD_CODES.has(err?.code)) {
        setPreview(null);
        setStage(STAGE_DEAD);
        return;
      }
      setError(t(refusalKey(err), refusalVars(err)));
    } finally {
      busyRef.current = false;
      setJoining(false);
    }
  }

  /* --------------------------------- states -------------------------------- */

  if (stage === STAGE_LOADING) {
    return (
      <div className="cc-invite-join" role="status" aria-live="polite">
        <span className="spinner" /> <span className="muted">{t('ui.loading')}</span>
      </div>
    );
  }

  if (stage === STAGE_DEAD) {
    return (
      <div className="cc-invite-join cc-invite-dead">
        <p className="cc-invite-title" style={{ fontWeight: 700 }}>
          <Icon name="info" size={17} /> {t('invite.deadTitle')}
        </p>
        {/* One sentence for every way a code can stop working, because the
            server will not say which one it was. */}
        <p className="muted">{t('invite.deadBody')}</p>
        <Link className="btn btn-secondary btn-sm" to="/groups">
          {t('invite.deadCta')}
        </Link>
      </div>
    );
  }

  if (stage === STAGE_DONE) {
    return (
      <div className="cc-invite-join cc-invite-done">
        <p className="cc-invite-title" style={{ fontWeight: 700 }}>
          <Icon name="checkCircle" size={17} /> {t('invite.joinedTitle', { name: joined?.name || '' })}
        </p>
        <p className="muted">{t('invite.joinedBody')}</p>
        <div className="cc-invite-actions">
          <Link className="btn btn-primary btn-sm" to={`/groups/${joined?.id || ''}`}>
            <Icon name="users" size={15} /> {t('invite.goToGroup')}
          </Link>
        </div>
      </div>
    );
  }

  /* -------------------------------- confirm -------------------------------- */

  const memberCount = Number(preview?.memberCount) || 0;

  return (
    <div className="cc-invite-join cc-invite-confirm">
      <p className="cc-invite-title" style={{ fontWeight: 700 }}>
        {t('invite.confirmTitle', { name: preview?.groupName || '' })}
      </p>

      <p className="smallish muted">{t('invite.confirmCount', { n: memberCount })}</p>

      {/* The role is SHOWN, not chosen: `member` is the least power in
          GROUP_ROLES and can only read the group. The sentence saying so is a
          key, so it reads correctly in all fourteen languages. */}
      <p className="cc-invite-role smallish">
        <Icon name="user" size={14} />
        <span className="cc-invite-roleLabel">{t('invite.roleLabel')}</span>
        <span className="pill cc-invite-roleValue">{t('invite.roleMember')}</span>
      </p>

      <ul className="cc-invite-notes smallish">
        <li>
          <Icon name="shield" size={13} /> <span>{t('invite.onePerson')}</span>
        </li>
        <li>
          <Icon name="info" size={13} /> <span>{t('invite.notPromotion')}</span>
        </li>
      </ul>

      {error && (
        <p className="field-error" role="alert">
          <Icon name="warning" size={15} />
          <span>{error}</span>
        </p>
      )}

      {user ? (
        <div className="cc-invite-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={joining}>
            {t('ui.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={joining}>
            {joining ? <span className="spinner" /> : <Icon name="checkCircle" size={16} />}{' '}
            {joining ? t('invite.joining') : t('invite.confirm')}
          </button>
        </div>
      ) : (
        /* Not signed in: joining would not know who is joining, so the server
           would refuse it anyway. Sign in first, and the link is carried
           through in the router state so they come back to this screen. */
        <div className="cc-invite-actions">
          <p className="smallish muted w-100">{t('invite.signInFirst')}</p>
          <Link className="btn btn-primary" to="/login" state={{ from: `/join/${token}` }}>
            <Icon name="login" size={16} /> {t('invite.signIn')}
          </Link>
        </div>
      )}
    </div>
  );
}
