import { useState } from 'react';

import Modal from './Modal.jsx';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';
import { useLocale } from '../locale.jsx';

/**
 * What a reader can do to one subscription: hold it, let it go again, stop it,
 * and choose how many days' notice they want about it.
 *
 * A button that does not apply to the row's state is not drawn at all. A
 * "Resume" on an entry that is not paused is a claim about what is possible, and
 * on a cancelled entry every one of the three is a lie - so a cancelled row
 * carries no controls whatsoever, only the sentence that says it is cancelled.
 *
 * Pause and Cancel are confirmed; Resume and the warning distance are not.
 * Resuming undoes a pause the student themselves asked for a moment ago, and a
 * distance is a preference with a dropdown in full view - neither needs a
 * dialog saying the same thing twice. Pausing is confirmed because it names a
 * number of days the student has to read before agreeing to them, and
 * cancelling is confirmed because the thing it stops is a payment to a company:
 * a student deserves to be told that the app is not the one holding it up.
 *
 * Nothing in here decides anything. Every answer - the day a pause ends, the day
 * a resumed entry charges again, the warning distance that was stored - is the
 * one the server sent back, and it is printed as it came.
 */

/**
 * The warning distances on offer, written out rather than generated: "on the
 * day" is zero, and every other choice is a round number a student can picture.
 * The server accepts 0 to 30 or the default; this list is the short version of
 * that range, not a new one.
 */
const REMINDER_CHOICES = [0, 3, 7, 14, 30];

/** A whole number of days, at least one - the shape the server will accept. */
function isWholeDays(value) {
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number(text) >= 1;
}

export default function RenewalActions({ row, name, amount, defaultWindow, onPause, onResume, onCancel, onReminder }) {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [busy, setBusy] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [days, setDays] = useState('');
  const [problem, setProblem] = useState('');

  // The three states, taken from the server. `isActive === false` is cancelled,
  // and a cancelled entry is inert here: nothing to hold, nothing to resume,
  // nothing to stop.
  if (row.isActive === false) return null;

  const canPause = !row.isPaused;
  const canResume = Boolean(row.isPaused);

  function openPause() {
    setProblem('');
    // Deliberately empty rather than pre-filled with a number: the days are the
    // student's decision, and a field that arrives already full of somebody
    // else's guess is a number on this screen that came from nowhere.
    setDays('');
    setPausing(true);
  }

  async function confirmPause() {
    setBusy(true);
    setProblem('');
    try {
      await onPause(row, days.trim());
      setPausing(false);
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    setBusy(true);
    setProblem('');
    try {
      await onCancel(row);
      setCancelling(false);
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* Resume and the warning distance have no dialog to keep the reason in, so
     their own sentence goes to the toast the screen already has rather than
     being swallowed here. It is the server's sentence, unedited. */
  async function run(work) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const reminderValue = row.reminderDays === null || row.reminderDays === undefined ? '' : String(row.reminderDays);
  // A distance set somewhere else (the server accepts 0-30) still has to be
  // shown, or the select would quietly display a choice the student is not on.
  const extra = REMINDER_CHOICES.includes(Number(row.reminderDays)) ? null : row.reminderDays;

  return (
    /* the buttons and the warning distance are direct children of one wrapping
       row, so a phone puts each of them on its own line without help */
    <div className="cc-renew-actions" role="group" aria-label={name}>
      {canPause && (
        <button type="button" className="btn btn-ghost" onClick={openPause} disabled={busy}>
          <Icon name="hourglass" size={15} /> {t('rec.pause')}
        </button>
      )}

      {canResume && (
        <button type="button" className="btn btn-secondary" onClick={() => run(() => onResume(row))} disabled={busy}>
          <Icon name="play" size={15} /> {t('rec.resume')}
        </button>
      )}

      <button type="button" className="btn btn-danger-outline" onClick={() => { setProblem(''); setCancelling(true); }} disabled={busy}>
        <Icon name="ban" size={15} /> {t('vault.cancelBtn')}
      </button>

      {defaultWindow !== null && (
        /* a basis of its own, so the select claims the rest of the row on a
           wide card and takes a whole line of it on a phone */
        <div style={{ flex: '1 1 170px', minWidth: 0 }}>
          <FormField label={t('sub.reminderLabel')} htmlFor={`renew-warn-${row.ruleId}`}>
            {(a) => (
              <select
                id={`renew-warn-${row.ruleId}`}
                className="input cc-renew-warn"
                value={reminderValue}
                disabled={busy}
                onChange={(event) => run(() => onReminder(row, event.target.value === '' ? null : event.target.value))}
                {...a}
              >
                {/* the default is the server's own window, quoted from the check it
                    answered with - never a number picked here */}
                <option value="">{t('sub.reminderDefault', { n: defaultWindow })}</option>
                {extra !== null && (
                  <option value={String(extra)}>{plural('sub.reminderIn', extra, { n: extra })}</option>
                )}
                {REMINDER_CHOICES.map((choice) => (
                  <option key={choice} value={String(choice)}>
                    {choice === 0 ? t('sub.reminderOff') : plural('sub.reminderIn', choice, { n: choice })}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
      )}

      {pausing && (
        <Modal
          title={t('sub.pauseTitle')}
          onClose={() => setPausing(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPausing(false)}>
                {t('ui.cancel')}
              </button>
              {/* the button that says yes only exists once there is a number to
                  say yes to, and the field says which one is missing */}
              {isWholeDays(days) && (
                <button type="button" className="btn btn-primary" onClick={confirmPause} disabled={busy}>
                  {busy && <span className="spinner" aria-hidden="true" />}
                  {t('rec.pause')}
                </button>
              )}
            </>
          }
        >
          {problem && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" />
              <span>{problem}</span>
            </div>
          )}

          {/* The sentence that names the days appears only once there are days to
              name - a copy with an empty slot in it is a hole in the middle of a
              sentence. It carries no date: the day the charges come back is not
              knowable until the server has been asked, and a client that worked
              one out for this dialog would be promising something the server has
              not said. The real date arrives in the toast, from the server. */}
          {isWholeDays(days) && <p>{t('sub.pauseBodyNoDate', { name, days: days.trim() })}</p>}

          <FormField label={t('sub.pauseDays')} htmlFor={`renew-pause-days-${row.ruleId}`}>
            {(a) => (
              <input
                id={`renew-pause-days-${row.ruleId}`}
                className="input"
                type="number"
                min={1}
                inputMode="numeric"
                value={days}
                onChange={(event) => setDays(event.target.value)}
                {...a}
              />
            )}
          </FormField>

          {!isWholeDays(days) && <p className="field-help">{t('sub.pauseDaysNeed')}</p>}
        </Modal>
      )}

      {cancelling && (
        <Modal
          title={t('sub.cancelTitle')}
          onClose={() => setCancelling(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setCancelling(false)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={confirmCancel} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {t('vault.cancelBtn')}
              </button>
            </>
          }
        >
          {problem && (
            <div className="field-error mb-3" role="alert">
              <Icon name="warning" />
              <span>{problem}</span>
            </div>
          )}

          <p>{t('sub.cancelBody', { name, amount })}</p>
          {/* what it keeps, and what it does not: there is no undo on this screen
              and none is offered, because the entry really has stopped */}
          <p className="smallish muted mb-0">{t('sub.cancelKeeps')}</p>
        </Modal>
      )}
    </div>
  );
}
