import { useCallback, useEffect, useState } from 'react';

import Icon from './Icon.jsx';
import FormField from './FormField.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';

/**
 * Delete account, with a seven-day grace period (NEW-1).
 *
 * THREE STEPS, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT
 * -------------------------------------------------------
 * 1. WHY - an optional reason, and nothing irreversible.
 * 2. WHAT - the date is written by the server, the list of what goes and what
 *    survives is on screen, and nothing has happened yet.
 * 3. PASSWORD - typed LAST, immediately before the button that commits it.
 *
 * The password is re-typed because a session can be left open on a shared lab
 * machine, and because somebody who can walk up to an unlocked laptop should not
 * be able to close somebody's account. Typing it at the end rather than the
 * start is deliberate: a password field filled in three screens ago is a
 * password field somebody can walk away from, and the last thing before an
 * irreversible action should be the thing that proves who is doing it.
 *
 * A PENDING REQUEST DOES NOT MOVE
 * -------------------------------
 * The card says so in as many words, because the alternative is a student who
 * clicks twice to be sure and quietly gives themselves seven more days without
 * knowing it. The day is written once, by the server, and the card shows the
 * one it was given.
 *
 * "Former member" is `del.formerMember`, and it is said HERE, where the person
 * is deciding - not in the group screens, which have their own copy of it and
 * will render it for a member row that no longer names anybody.
 */
export default function DeleteAccountCard() {
  const { t, language } = useLocale();
  const { push } = useToast();

  const [deletion, setDeletion] = useState(null);
  const [graceDays, setGraceDays] = useState(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const day = useCallback(
    (value) => {
      const d = value ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(language || 'en', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    [language]
  );

  useEffect(() => {
    let alive = true;
    api
      .get('/api/account/deletion')
      .then((data) => {
        if (!alive) return;
        setDeletion(data.deletion);
        setGraceDays(data.graceDays);
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  function take(data) {
    setDeletion(data.deletion);
    if (data.graceDays) setGraceDays(data.graceDays);
  }

  async function schedule() {
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/api/account/deletion', { password, reason });
      take(data);
      setPassword('');
      setReason('');
      setConfirming(false);
      push(t('del.scheduled', { date: day(data.deletion.scheduledFor) }), 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      take(await api.del('/api/account/deletion'));
      push(t('del.keeping'), 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const pending = Boolean(deletion?.pending);
  const days = deletion?.daysLeft ?? graceDays ?? 7;

  return (
    <section className="card cc-del-card" aria-labelledby="cc-del-title">
      <h3 className="cc-del-title" id="cc-del-title">
        <Icon name="trash" /> {t('del.title')}
      </h3>

      {pending ? (
        /* The calmest block on the page, and that is the point: what reassures
           somebody is "you have seven days", not a red panel. */
        <div className="cc-del-pending">
          <p className="cc-del-when">{t('del.pendingTitle', { date: day(deletion.scheduledFor) })}</p>
          <p className="cc-del-note">{t('del.pendingBody', { days })}</p>
          <p className="cc-del-note">{t('del.pendingNote')}</p>
          <div className="cc-del-actions">
            <button type="button" className="btn btn-danger-outline btn-sm" onClick={cancel} disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {t('del.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="cc-del-body">{t('del.body')}</p>

          {!confirming ? (
            <div className="cc-del-form">
              <FormField label={t('del.reason')} htmlFor="delete-reason" help={t('del.reasonHelp')}>
                {(a) => (
                  <input
                    id="delete-reason"
                    className="input"
                    type="text"
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    {...a}
                  />
                )}
              </FormField>
              <div className="cc-del-actions">
                <button
                  type="button"
                  className="btn btn-danger-outline cc-del-danger"
                  onClick={() => {
                    setError('');
                    setConfirming(true);
                  }}
                  disabled={busy}
                >
                  {t('del.start')}
                </button>
              </div>
            </div>
          ) : (
            /* The re-entry box, and the last thing on the page before the
               button that cannot be undone. The exact day is the SERVER's to
               give - it is written once, when the request is made, and a card
               that worked it out for itself could be showing a date that is not
               the real one. */
            <div className="cc-del-confirm">
              <p className="cc-del-confirmTitle">{t('del.dangerTitle')}</p>
              <p className="cc-del-body">{t('del.confirmBody', { days })}</p>
              <p className="cc-del-note">{t('del.formerMemberNote')}</p>

              <FormField label={t('del.password')} htmlFor="delete-password" help={t('del.passwordHelp')}>
                {(a) => (
                  <input
                    id="delete-password"
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    {...a}
                  />
                )}
              </FormField>

              <div className="cc-del-actions">
                <button type="button" className="btn btn-danger-outline cc-del-danger" onClick={schedule} disabled={busy}>
                  {busy && <span className="spinner" aria-hidden="true" />}
                  {busy ? t('del.working') : t('del.confirmYes')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setPassword('');
                    setConfirming(false);
                  }}
                  disabled={busy}
                >
                  {t('del.confirmNo')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="cc-del-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </p>
      )}
    </section>
  );
}
