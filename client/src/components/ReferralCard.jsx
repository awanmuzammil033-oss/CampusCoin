import { useEffect, useRef, useState } from 'react';

import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

/**
 * Invite a friend, and the rewards that come of it (NEW-10).
 *
 * Five things on one card, and every one of them is a fact the server sent:
 * the link to share, the message to send with it, the code to read out loud,
 * the badge, and the list of who actually joined. The words are all keys — the
 * share message included, which arrives as `{ key, vars }` because the person
 * reading it is the friend, not the account that owns this card.
 *
 * Two numbers the card is careful about:
 *  - `rewarded` is the count of rewards EARNED, and a friend who has signed up
 *    but not logged an entry yet is listed as joined and not rewarded, with the
 *    reason on the row. The screen must not round that up to "you have 4
 *    friends" and quietly imply the fifth one counts.
 *  - `capReached` is its own line of words. When the five rewards are gone the
 *    card says so in a sentence of its own rather than counting to six and
 *    letting the student work out that nothing is being earned any more.
 *
 * The card hides itself when the read fails: a profile is still a profile
 * without an invite box, and an error banner about a referral link would be a
 * worse thing on the screen than nothing at all.
 */
export default function ReferralCard() {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [card, setCard] = useState(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState('');
  const copiedTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/referrals/mine')
      .then((res) => {
        if (alive) setCard(res);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  async function copy(what, text) {
    const ok = await copyText(text);
    if (!ok) {
      push(t('ref.copyError'), 'error');
      return false;
    }
    setCopied(what);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(''), 2200);
    push(t('ref.copied'), 'success');
    return true;
  }

  /**
   * The share sheet where the phone has one, a copy where it does not.
   *
   * A cancellation is not a failure, and a share that throws for any other
   * reason falls through to the copy rather than leaving the student with a
   * button that did nothing.
   */
  async function share() {
    const text = t(card.shareText.key, card.shareText.vars);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: t('ref.title'), text, url: card.url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    await copy('share', text);
  }

  if (failed || !card) return null;

  const message = t(card.shareText.key, card.shareText.vars);
  const pips = Array.from({ length: card.cap }, (unused, i) => i < card.rewarded);

  return (
    <section className="card cc-ref" aria-labelledby="cc-ref-title">
      <h2 className="cc-ref-title" id="cc-ref-title">
        <Icon name="gift" /> {t('ref.title')}
      </h2>

      <p className="smallish muted">{t('ref.subtitle')}</p>

      {/* The link. An absolute one, because it is going to be opened on a phone
          that has never heard of this laptop. The button is BELOW the field on
          purpose: a long link and a button side by side is a two-word button on
          a phone. */}
      <div className="field">
        <label className="smallish" htmlFor="cc-ref-link">
          {t('ref.linkLabel')}
        </label>
        <input
          id="cc-ref-link"
          className="input cc-ref-link"
          type="text"
          readOnly
          value={card.url}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => copy('link', card.url)}>
          <Icon name="copy" size={15} /> {copied === 'link' ? t('ref.copied') : t('ref.copyLink')}
        </button>
      </div>

      {/* The code, on its own line, because half the time it is read out loud
          rather than pasted — which is why the alphabet has no 0/O and no 1/l.
          `user-select: all` on it means a tap on a phone selects the whole code. */}
      <div className="field">
        <span className="cc-ref-code-label" id="cc-ref-code-label">
          {t('ref.codeLabel')}
        </span>
        <code className="cc-ref-code" aria-labelledby="cc-ref-code-label">
          {card.code}
        </code>
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => copy('code', card.code)}>
          <Icon name="copy" size={15} /> {copied === 'code' ? t('ref.copied') : t('ref.copyCode')}
        </button>
      </div>

      {/* The message to send, and the one button that sends it. */}
      <p className="cc-ref-share">{message}</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={share}>
        <Icon name="send" size={15} /> {t('ref.share')}
      </button>

      {/* The badge: one mark per reward earned, out of the five there are. The
          pips are decoration — the count beside them is the answer, and it is
          the one a screen reader reads out. */}
      <div className="cc-ref-badge">
        <Icon name="trophy" size={16} />{' '}
        <span className="num smallish">{t('ref.rewardCount', { earned: card.rewarded, cap: card.cap })}</span>
        <ul className="cc-ref-pips" aria-hidden="true">
          {pips.map((earned, i) => (
            // the space before the expression is not cosmetic: scripts
            // check-css-hooks.mjs stops reading a className at the first quote
            // inside the expression, so `cc-ref-pip${...}` is invisible to it and
            // a hook with no rule would sail through. `cc-ref-pip ${...}` is read.
            <li key={i} className={`cc-ref-pip ${earned ? 'is-on' : ''}`} />
          ))}
        </ul>
      </div>

      {card.capReached && <p className="cc-ref-cap">{t('ref.capReached', { cap: card.cap })}</p>}

      {/* Who joined. A name and a day — never an address, and never a row for
          somebody who signed up without the link. */}
      <h3 className="card-title">{t('ref.joined')}</h3>
      {card.joined.length === 0 ? (
        <p className="smallish muted mb-0">{t('ref.joinedNone')}</p>
      ) : (
        <ul className="cc-ref-list">
          {card.joined.map((row, i) => (
            <li key={`${row.name}-${i}`} className="cc-ref-item">
              <Icon name={row.rewarded ? 'checkCircle' : 'clock'} size={16} />
              <span>{row.name}</span>
              <span className="cc-ref-when smallish muted">{t('ref.joinedOn', { date: dayLabel(row.joinedOn) })}</span>
              <span className={`cc-ref-item-state smallish ${row.rewarded ? '' : 'muted'}`}>
                {t(row.rewarded ? 'ref.rowRewarded' : 'ref.rowWaiting')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {card.pending > 0 && (
        <p className="smallish muted mb-0">{plural('ref.pending', card.pending, { count: card.pending })}</p>
      )}

      <p className="field-help mb-0">
        <Icon name="info" size={14} /> {t('ref.why')} {t('ref.whyBody')}
      </p>
    </section>
  );
}

/**
 * Copy, with the old path still in it.
 *
 * `navigator.clipboard` only exists in a secure context, and an invite link is
 * very often opened from a phone on a campus network over plain http — where the
 * button would silently do nothing. The execCommand path still works there, and
 * a select-and-copy beats a control that appears broken.
 */
async function copyText(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the older path rather than reporting a failure outright
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
