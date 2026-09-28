import { useCallback, useEffect, useState } from 'react';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useLocale } from '../locale.jsx';
import { useToast } from './Toast.jsx';

/**
 * The owner's side of a group invite: make a code, show it, copy the link, throw
 * it away.
 *
 * WHY THE CODE IS SHOWN ONCE
 * --------------------------
 * The server keeps only a hash of the token, so the plain text exists for
 * exactly one response — the one that mints it. This component therefore holds
 * the code in state and nowhere else, and a refresh genuinely loses it. That is
 * not a gap in the screen to be filled in later; it is the design. It is also
 * why the "one already out there" state offers a revoke and a fresh code rather
 * than pretending it can show you the old one: a panel that could re-display a
 * live invite after any reload would have to be storing the secret somewhere,
 * and the whole reason the database holds a hash is that it does not.
 *
 * A REFUSAL IS A CODE, NOT A SENTENCE
 * ----------------------------------
 * The server answers a refusal with a code (services/groupInvites.js), never
 * with English, so it can be read in all fourteen languages. The screen turns
 * the code into a key here, and the list below is that translation table. A
 * code this build has never heard of falls back to `invite.error` rather than
 * printing a raw identifier at a student.
 *
 * THE COPY FALLBACK
 * -----------------
 * `navigator.clipboard` needs a secure context, and a student on a campus
 * wifi page served over http is not in one. The textarea is a real, focusable,
 * selectable control for exactly that case, so the link is always reachable
 * with the keyboard whether or not the API exists.
 */

const STAGE_IDLE = 'idle';
const STAGE_LIVE = 'live';
const STAGE_MINTED = 'minted';

/** The server's group half; the join half is in JoinGroupPanel. */
const REFUSAL_KEYS = new Set([
  'invite.liveExists',
  'invite.groupFull',
  'invite.groupClosed',
  'invite.groupGone',
  'invite.noGroup',
  'invite.noInvite',
  'invite.noPermission',
  'invite.tooManyTries',
  'invite.error',
]);

function refusalKey(err) {
  return REFUSAL_KEYS.has(err?.code) ? err.code : 'invite.error';
}

function refusalVars(err) {
  return { waitMinutes: err?.waitMinutes, max: err?.max };
}

export default function InviteQr({ groupId, groupName, canManage = true, memberCount = 0, maxMembers = 20 }) {
  const { t } = useLocale();
  const { push } = useToast();
  const [stage, setStage] = useState(STAGE_IDLE);
  const [invite, setInvite] = useState(null);
  const [listed, setListed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  /* The live list is the source of truth for "is there already one out there",
   * because this page may have been open before somebody else issued one. */
  const refresh = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await api.get(`/api/groups/${groupId}/invites`);
      const rows = res?.invites || [];
      setListed(rows);
      if (rows.length > 0) setStage(STAGE_LIVE);
    } catch {
      setListed([]);
    }
  }, [groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function mint() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/api/groups/${groupId}/invites`, {});
      setInvite(res.invite);
      setStage(STAGE_MINTED);
      await refresh();
    } catch (err) {
      setError(t(refusalKey(err), refusalVars(err)));
      // A refusal about a code that already exists is worth re-reading the
      // list for, so the panel shows what IS out there rather than an error
      // with nothing underneath it.
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/groups/${groupId}/invites/${id}`);
      setInvite(null);
      setCopied(false);
      setStage(STAGE_IDLE);
      await refresh();
      push(t('invite.revoked'));
    } catch (err) {
      setError(t(refusalKey(err), refusalVars(err)));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!invite?.url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.url);
        setCopied(true);
        push(t('invite.copied'));
      } else {
        setError(t('invite.copyManual'));
      }
    } catch {
      setError(t('invite.copyManual'));
    }
  }

  if (!canManage) return null;

  /* A group that is already full refuses a code server-side, so the button is
   * not drawn with an error waiting behind it — the same rule the rest of the
   * group screen follows: a control the server would refuse is not shown. */
  const full = memberCount >= maxMembers;
  const shown = invite || listed?.[0] || null;

  return (
    <div className="cc-invite">
      <p className="cc-invite-note smallish muted">
        <Icon name="scan" size={14} /> {t('invite.onePerson')}
      </p>

      {stage === STAGE_MINTED && invite && (
        <div className="cc-invite-card">
          {/*
            WHY AN <img> WITH A DATA URI, AND NOT dangerouslySetInnerHTML.

            The server sends SVG MARKUP, and markup in an img src is not
            rendered — it is read as a URL, so src={svg} is a broken image. A
            data URI is the way to put server-rendered markup on the page as an
            image, and it is right for a second reason as well: an img renders
            in its own inert context, so the SVG cannot touch this document's
            DOM, cannot read the token back out of the page, and needs no
            sanitiser here. The alternative, dangerouslySetInnerHTML, would put
            server output into the live document and make "is this string safe"
            a question to answer again every time this feature changes.
          */}
          <img
            className="cc-invite-qr"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(invite.svg)}`}
            alt={t('invite.qrAlt')}
            width={180}
            height={180}
          />
          <p className="smallish muted mb-1">{t('invite.scanToJoin')}</p>
          <textarea
            className="input cc-invite-link"
            readOnly
            rows={2}
            value={invite.url}
            aria-label={t('invite.linkLabel')}
            onFocus={(event) => event.target.select()}
          />
          <p className="cc-invite-when smallish muted mb-0">
            {t('invite.expiresAt', { when: invite.expiresAt })}
          </p>
        </div>
      )}

      {stage !== STAGE_MINTED && shown && (
        <div className="cc-invite-live">
          <p className="smallish mb-1">{t('invite.oneOut')}</p>
          <p className="cc-invite-when smallish muted">{t('invite.expiresAt', { when: shown.expiresAt })}</p>
          {/* The plain code is not in the database, so it genuinely cannot be
              shown again. Saying that is more useful than an empty box. */}
          <p className="smallish muted mb-0">{t('invite.codeGone')}</p>
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          <Icon name="warning" size={15} />
          <span>{error}</span>
        </p>
      )}

      <div className="cc-invite-actions">
        {stage === STAGE_MINTED || shown ? (
          <>
            {stage === STAGE_MINTED && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
                <Icon name="copy" size={15} /> {copied ? t('invite.copiedShort') : t('invite.copy')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger-outline btn-sm"
              onClick={() => revoke(shown.id)}
              disabled={busy}
            >
              <Icon name="ban" size={15} /> {t('invite.revoke')}
            </button>
          </>
        ) : full ? (
          <p className="smallish muted mb-0">
            <Icon name="lock" size={13} /> {t('invite.groupFull', { max: maxMembers })}
          </p>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={mint} disabled={busy}>
            <Icon name="plus" size={15} /> {t('invite.make')}
          </button>
        )}
      </div>

      {groupName && (
        <p className="cc-invite-foot smallish muted mb-0">{t('invite.whereToPost', { name: groupName })}</p>
      )}
    </div>
  );
}
