import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Icon from './Icon.jsx';
import VoiceInput from './VoiceInput.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';

/**
 * Quick-text expense logger (QS-1).
 *
 * One box on the dashboard where the student writes the sentence they would
 * have said out loud — "yaar aaj canteen par 350 kharch kiye" — and it becomes
 * a real entry. While they type, the server is asked what it makes of the
 * sentence, so the confirmation is never a surprise: amount, category and date
 * are all on screen before anything is saved, and each one is honest about how
 * it was worked out (a word it recognised, or a fallback it admits to).
 *
 * Two rules the UI keeps to:
 *  - nothing is saved until the student presses the button;
 *  - after saving, the entry can be undone from the same confirmation, because
 *    a logger that guesses wrong should cost one click to fix, not a search
 *    through the transaction list.
 */
export default function QuickTextCard() {
  const { t, language } = useLocale();
  const { push } = useToast();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const dayLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language || 'en', {
      day: 'numeric',
      month: 'short',
    });
  };

  // Ask the server what the sentence means, but only while it is still being
  // written: a debounce keeps typing smooth and stops a request per letter.
  //
  // Clearing `saved` only when there is something typed matters: the save itself
  // empties the box, and wiping the confirmation on that empty string would take
  // away the very message the student needs to see (and undo from).
  useEffect(() => {
    const value = text.trim();
    if (value.length === 0) {
      setDraft(null);
      return undefined;
    }
    setSaved(null);
    if (value.length < 3) {
      setDraft(null);
      return undefined;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      api
        .post('/api/quick-text/preview', { text: value })
        .then((res) => setDraft(res.draft))
        .catch(() => setDraft(null))
        .finally(() => setChecking(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      setChecking(false);
    };
  }, [text]);

  async function save() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/api/quick-text', { text: value });
      setSaved(res);
      setText('');
      setDraft(null);
      push(t('quick.savedToast', { category: res.category.name, amount: money(res.transaction.amount) }), 'success');
    } catch (err) {
      setError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function undo() {
    if (!saved?.transaction?.id) return;
    setBusy(true);
    try {
      await api.del(`/api/transactions/${saved.transaction.id}`);
      setSaved(null);
      push(t('quick.undone'), 'success');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const confirmed = saved?.transaction;

  return (
    <section className="card quick-text-card" aria-labelledby="quick-text-title">
      <div className="card-title">
        <span id="quick-text-title">
          <Icon name="sparkle" /> {t('quick.title')}
        </span>
        <Link className="btn btn-ghost btn-sm" to="/transactions/new">
          {t('quick.useForm')}
        </Link>
      </div>

      <p className="smallish muted">{t('quick.help')}</p>

      <form
        className="quick-text-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="visually-hidden" htmlFor="quick-text-input">
          {t('quick.label')}
        </label>
        <input
          id="quick-text-input"
          ref={inputRef}
          className="form-control"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('quick.placeholder')}
          autoComplete="off"
          maxLength={240}
        />
        {/* saying the sentence IS the sentence: the transcript goes through the
            same reader, the same confirmation and the same undo as typing */}
        <VoiceInput
          onText={setText}
          lang={language}
          onError={(message) => push(message, 'error')}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || text.trim().length < 2}>
          <Icon name="bolt" /> {busy ? t('quick.saving') : t('quick.add')}
        </button>
      </form>
      <p className="smallish muted mt-2 mb-0">
        <Icon name="mic" size={14} /> {t('voice.hint')}
      </p>

      {/* live reading of the sentence, before anything is saved */}
      {checking && !draft && <p className="smallish muted mb-0 mt-2">{t('quick.reading')}</p>}

      {!confirmed && draft?.ok && (
        <div className="quick-text-read mt-3" data-testid="quick-read">
          <span className="pill pill-expense num">
            {draft.type === 'income' ? '+' : '−'} {money(draft.amount)}
          </span>
          <span className="pill">{draft.categoryName}</span>
          <span className="pill">{dayLabel(draft.date)}</span>
          <span className="smallish muted">
            {draft.categoryHint === 'words' ? t('quick.sureCategory') : t('quick.fallbackCategory')}
          </span>
        </div>
      )}

      {!confirmed && draft && !draft.ok && text.trim().length >= 3 && (
        <p className="field-error mb-0 mt-2" role="status">
          <Icon name="warning" size={16} />
          <span>{draft.reason === 'no-amount' ? t('quick.noAmount') : t('quick.tooShort')}</span>
        </p>
      )}

      {error && (
        <p className="field-error mb-0 mt-2" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </p>
      )}

      {/* the friendly confirmation, with the working and an undo */}
      {confirmed && (
        <div className="quick-text-saved mt-3" role="status">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Icon name="checkCircle" />
            <strong>
              {t('quick.savedAs', {
                category: saved.category.name,
                amount: money(confirmed.amount),
                date: dayLabel(confirmed.date),
              })}
            </strong>
          </div>
          <div className="smallish muted mt-1">
            {confirmed.description}
            {saved.draft?.confidence != null && (
              <> · {t('quick.confidence', { pct: Math.round(saved.draft.confidence * 100) })}</>
            )}
          </div>
          <div className="d-flex gap-2 mt-2 flex-wrap">
            <button className="btn btn-ghost btn-sm" type="button" onClick={undo} disabled={busy}>
              <Icon name="trash" size={15} /> {t('quick.undo')}
            </button>
            <Link className="btn btn-ghost btn-sm" to="/transactions">
              {t('quick.seeAll')}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
