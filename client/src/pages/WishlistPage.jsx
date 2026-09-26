import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money, ledgerCurrencySymbol } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

/**
 * The pictures a wish can wear. The emoji itself is what gets stored, so
 * whatever the student picks is exactly what every screen draws — no key
 * table to keep in step.
 */
const PICTURES = [
  { key: 'headphones', emoji: '🎧' },
  { key: 'book', emoji: '📚' },
  { key: 'trip', emoji: '✈️' },
  { key: 'shoes', emoji: '👟' },
  { key: 'laptop', emoji: '💻' },
  { key: 'phone', emoji: '📱' },
  { key: 'game', emoji: '🎮' },
  { key: 'film', emoji: '🎬' },
  { key: 'watch', emoji: '⌚' },
  { key: 'guitar', emoji: '🎸' },
  { key: 'art', emoji: '🎨' },
  { key: 'ride', emoji: '🏍️' },
];

const DEFAULT_PICTURE = '🎁';
const HISTORY = 8; // how many jar movements the panel shows

function asDay(value) {
  return String(value || '').slice(0, 10);
}

/**
 * Secret wishlist & micro-savings jar (WISH-1 / WISH-2).
 *
 * One page, two halves. The jar on top is the pot: the student skipped
 * something, presses "Save to jar" and the money is set aside instead of spent
 * — it never becomes a transaction, so the ledger, the charts and the reports
 * are untouched by it. Underneath, one card per wish with the bar that says
 * how close it is. The whole list is private to the student; nothing here is
 * shared, and the wording says so.
 */
export default function WishlistPage() {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [jar, setJar] = useState({ amount: '', wishItemId: '', note: '', date: '' });
  const [jarError, setJarError] = useState('');

  const [draft, setDraft] = useState(null); // the add/edit form
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState(null);

  const [move, setMove] = useState(null); // { kind: 'deposit' | 'withdraw', item }
  const [moveForm, setMoveForm] = useState({ amount: '', note: '' });
  const [moveError, setMoveError] = useState('');

  function load() {
    return api
      .get(`/api/wishlist${qs({ history: 1, limit: HISTORY })}`)
      .then((d) => {
        setData({
          rows: d.rows || [],
          jarBalance: d.jarBalance || 0,
          summary: d.summary || null,
          movements: d.movements || [],
        });
        setError('');
      })
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push]);

  /* --------------------------------- the jar --------------------------------- */

  async function moveMoney(kind, { wishItemId = '', amount, note = '', date = '' }) {
    const body = { amount: String(amount || '').trim() };
    if (wishItemId) body.wishItemId = wishItemId;
    if (String(note || '').trim()) body.note = String(note).trim();
    if (date) body.date = date;
    return api.post(`/api/wishlist/jar/${kind}`, body);
  }

  async function submitJar(event, kind) {
    event.preventDefault();
    setJarError('');
    setBusy(true);
    try {
      const sent = money(jar.amount);
      await moveMoney(kind, jar);
      push(kind === 'deposit' ? t('wishlist.savedTo', { amount: sent }) : t('wishlist.takenFrom', { amount: sent }));
      setJar({ amount: '', wishItemId: '', note: '', date: '' });
      await load();
    } catch (err) {
      setJarError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openMove(kind, item) {
    setMoveError('');
    setMoveForm({ amount: '', note: '' });
    setMove({ kind, item: item || null });
  }

  async function submitMove(event) {
    event.preventDefault();
    setMoveError('');
    setBusy(true);
    try {
      const sent = money(moveForm.amount);
      await moveMoney(move.kind, { wishItemId: move.item?.id, ...moveForm });
      push(move.kind === 'deposit' ? t('wishlist.savedTo', { amount: sent }) : t('wishlist.takenFrom', { amount: sent }));
      setMove(null);
      await load();
    } catch (err) {
      setMoveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------------- the wishes ------------------------------ */

  function openWish(item) {
    setFormError('');
    setDraft(
      item
        ? {
            id: item.id,
            title: item.title,
            targetAmount: String(item.targetAmount),
            note: item.note || '',
            icon: item.icon || DEFAULT_PICTURE,
            targetDate: asDay(item.targetDate),
            // "Achieved" is shown greyed out: it is earned by the arithmetic,
            // so it can be read but never picked.
            status: item.status === 'paused' ? 'paused' : item.status,
          }
        : { id: null, title: '', targetAmount: '', note: '', icon: DEFAULT_PICTURE, targetDate: '', status: 'saving' }
    );
  }

  async function saveWish(event) {
    event.preventDefault();
    setFormError('');
    const body = {
      title: draft.title.trim(),
      targetAmount: String(draft.targetAmount).trim(),
      note: draft.note.trim(),
      icon: draft.icon,
      targetDate: draft.targetDate || '',
    };
    // "achieved" is not sent: the server owns that decision.
    if (draft.id && draft.status !== 'achieved') body.status = draft.status;

    setBusy(true);
    try {
      if (draft.id) await api.patch(`/api/wishlist/${draft.id}`, body);
      else await api.post('/api/wishlist', body);
      setDraft(null);
      push(draft.id ? t('wishlist.updated') : t('wishlist.added'));
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeWish() {
    const target = removing;
    setBusy(true);
    try {
      await api.del(`/api/wishlist/${target.id}`);
      setRemoving(null);
      push(t('wishlist.removed'));
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------------- render -------------------------------- */

  const rows = data?.rows || [];
  const movements = data?.movements || [];
  const jarEmpty = data ? data.jarBalance === 0 && movements.length === 0 : false;

  return (
    <Page
      trail={[{ label: t('wishlist.title') }]}
      title={t('wishlist.title')}
      subtitle={t('wishlist.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={() => openWish(null)}>
          <Icon name="plus" /> {t('wishlist.newWish')}
        </button>
      }
    >
      <p className="smallish muted">
        <Icon name="shield" /> {t('wishlist.secret')}
      </p>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 52, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 52 }} />
          <p className="smallish muted mb-0 mt-3">{t('wishlist.loading')}</p>
        </div>
      )}

      {data && (
        <>
          {/* ------------------------------- the jar ------------------------------ */}
          <section className="card mb-3">
            <div className="card-title">
              <span>
                <Icon name="coin" /> {t('wishlist.jar')}
              </span>
              <span className="pill">{t('wishlist.jarBalance')}</span>
            </div>

            <p
              className="balance-display mb-0"
              aria-label={t('wishlist.jarAria', { amount: money(data.jarBalance) })}
            >
              {money(data.jarBalance)}
            </p>
            <p className="smallish muted mt-1 mb-0">{t('wishlist.jarBlurb')}</p>

            <form className="mt-3" onSubmit={(e) => submitJar(e, 'deposit')} noValidate>
              <div className="row g-2">
                <div className="col-12 col-sm-4">
                  <FormField label={t('ui.amount')} htmlFor="jar-amount">
                    {(a) => (
                      <div className="amount-wrap">
                        <span className="amount-prefix" aria-hidden="true">
                          {ledgerCurrencySymbol()}
                        </span>
                        <input
                          id="jar-amount"
                          className="input"
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={jar.amount}
                          onChange={(e) => setJar((f) => ({ ...f, amount: e.target.value }))}
                          {...a}
                        />
                      </div>
                    )}
                  </FormField>
                </div>
                <div className="col-12 col-sm-4">
                  <FormField label={t('wishlist.forWish')} htmlFor="jar-wish">
                    {(a) => (
                      <select
                        id="jar-wish"
                        className="input"
                        value={jar.wishItemId}
                        onChange={(e) => setJar((f) => ({ ...f, wishItemId: e.target.value }))}
                        {...a}
                      >
                        <option value="">{t('wishlist.justTheJar')}</option>
                        {rows.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.icon} {row.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                </div>
                <div className="col-12 col-sm-8 col-lg-4">
                  <FormField label={t('wishlist.noteOptional')} htmlFor="jar-note" help={t('wishlist.noteHelp')}>
                    {(a) => (
                      <input
                        id="jar-note"
                        className="input"
                        type="text"
                        maxLength={140}
                        value={jar.note}
                        onChange={(e) => setJar((f) => ({ ...f, note: e.target.value }))}
                        {...a}
                      />
                    )}
                  </FormField>
                </div>
                <div className="col-12 col-sm-4">
                  <FormField label={t('wishlist.when')} htmlFor="jar-date">
                    {(a) => (
                      <input
                        id="jar-date"
                        className="input"
                        type="date"
                        value={jar.date}
                        onChange={(e) => setJar((f) => ({ ...f, date: e.target.value }))}
                        {...a}
                      />
                    )}
                  </FormField>
                </div>
              </div>

              {jarError && (
                <div className="field-error" role="alert">
                  <Icon name="warning" />
                  <span>{jarError}</span>
                </div>
              )}

              <div className="d-flex gap-2 flex-wrap">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" />}
                  {t('wishlist.addToJar')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={(e) => submitJar(e, 'withdraw')}
                >
                  <Icon name="minus" /> {t('wishlist.takeOut')}
                </button>
              </div>
            </form>

            {jarEmpty ? (
              <EmptyState icon="coin" title={t('wishlist.jarEmptyTitle')}>
                {t('wishlist.jarEmpty')}
              </EmptyState>
            ) : (
              movements.length > 0 && (
                <>
                  <div className="card-title mt-4 mb-2">
                    <span>{t('wishlist.history')}</span>
                  </div>
                  <ul className="d-grid gap-2 mb-0" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {movements.map((m) => (
                      <li key={m.id} className="d-flex align-items-center gap-2 smallish flex-wrap">
                        <span className={`pill ${m.kind === 'deposit' ? 'pill-income' : ''}`}>
                          <Icon name={m.kind === 'deposit' ? 'arrowUp' : 'arrowDown'} size={15} />
                          {m.kind === 'deposit' ? t('wishlist.movementIn') : t('wishlist.movementOut')}
                        </span>
                        <span className="num">{money(m.amount)}</span>
                        {m.wishTitle && <span className="muted">{t('wishlist.forTitle', { title: m.wishTitle })}</span>}
                        {!m.wishTitle && m.note && <span className="muted">{m.note}</span>}
                        <span className="muted">{dayLabel(asDay(m.date))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )
            )}
          </section>

          {/* ------------------------------ the wishes ---------------------------- */}
          <div className="card-title">
            <span>{t('wishlist.wishes')}</span>
            {data.summary?.count > 0 && (
              <span className="pill num">{plural('wishlist.wishCount', data.summary.count, { n: data.summary.count })}</span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="gift"
                title={t('wishlist.emptyTitle')}
                action={
                  <button type="button" className="btn btn-primary mt-2" onClick={() => openWish(null)}>
                    <Icon name="plus" /> {t('wishlist.newWish')}
                  </button>
                }
              >
                {t('wishlist.emptyBody')}
              </EmptyState>
            </div>
          ) : (
            <div className="row g-3">
              {rows.map((item) => (
                <div className="col-12 col-md-6 col-xl-4" key={item.id}>
                  <article className="card h-100 d-flex flex-column">
                    <div className="d-flex align-items-center gap-2">
                      <span className="txn-ico">
                        <Icon glyph={item.icon || DEFAULT_PICTURE} />
                      </span>
                      <h3 className="mb-0">{item.title}</h3>
                    </div>

                    {item.note && <p className="smallish muted mb-0 mt-2">{item.note}</p>}

                    <WishBar item={item} />

                    <div className="d-flex justify-content-between gap-2 smallish muted mt-2 flex-wrap">
                      <span className="num">{t('wishlist.savedOf', { saved: money(item.savedAmount), target: money(item.targetAmount) })}</span>
                      <span className="num">
                        {item.remaining > 0
                          ? t('wishlist.remaining', { amount: money(item.remaining) })
                          : t('wishlist.achieved')}
                      </span>
                    </div>

                    {item.targetDate && (
                      <p className="smallish muted mb-0 mt-1">
                        <Icon name="calendar" size={15} /> {t('wishlist.byDate', { date: dayLabel(asDay(item.targetDate)) })}
                      </p>
                    )}

                    <div className="d-flex gap-2 flex-wrap mt-auto pt-3">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openMove('deposit', item)}>
                        <Icon name="plus" size={15} /> {t('wishlist.saveToThis')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={item.savedAmount <= 0}
                        onClick={() => openMove('withdraw', item)}
                      >
                        <Icon name="minus" size={15} /> {t('wishlist.takeFromThis')}
                      </button>
                      <button
                        type="button"
                        className="icon-btn ms-auto"
                        onClick={() => openWish(item)}
                        aria-label={t('wishlist.editAria', { title: item.title })}
                        title={t('ui.edit')}
                      >
                        <Icon name="pencil" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setFormError('');
                          setRemoving(item);
                        }}
                        aria-label={t('wishlist.deleteAria', { title: item.title })}
                        title={t('ui.delete')}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* -------------------------------- the modals ------------------------------ */}

      {draft && (
        <Modal
          title={draft.id ? t('wishlist.editTitle') : t('wishlist.addTitle')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="wish-form" className="btn btn-primary" disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {draft.id ? t('ui.saveChanges') : t('wishlist.saveNew')}
              </button>
            </>
          }
        >
          <form id="wish-form" onSubmit={saveWish} noValidate>
            <FormField label={t('wishlist.name')} htmlFor="wish-title">
              {(a) => (
                <input
                  id="wish-title"
                  className="input"
                  type="text"
                  maxLength={80}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('wishlist.target')} htmlFor="wish-target">
              {(a) => (
                <div className="amount-wrap">
                  <span className="amount-prefix" aria-hidden="true">
                    {ledgerCurrencySymbol()}
                  </span>
                  <input
                    id="wish-target"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.targetAmount}
                    onChange={(e) => setDraft((d) => ({ ...d, targetAmount: e.target.value }))}
                    {...a}
                  />
                </div>
              )}
            </FormField>

            <FormField label={t('wishlist.icon')} htmlFor="wish-icon" help={t('wishlist.iconHelp')}>
              {(a) => (
                <div className="chip-grid" id="wish-icon" role="group" aria-label={t('wishlist.icon')} {...a}>
                  {PICTURES.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className="chip"
                      aria-pressed={draft.icon === p.emoji}
                      aria-label={t(`wishlist.icon.${p.key}`)}
                      title={t(`wishlist.icon.${p.key}`)}
                      onClick={() => setDraft((d) => ({ ...d, icon: p.emoji }))}
                    >
                      <Icon glyph={p.emoji} />
                    </button>
                  ))}
                </div>
              )}
            </FormField>

            <FormField label={t('wishlist.noteOptional')} htmlFor="wish-note">
              {(a) => (
                <input
                  id="wish-note"
                  className="input"
                  type="text"
                  maxLength={200}
                  value={draft.note}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('wishlist.targetDate')} htmlFor="wish-date">
              {(a) => (
                <input
                  id="wish-date"
                  className="input"
                  type="date"
                  value={draft.targetDate}
                  onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            {draft.id && (
              <FormField label={t('wishlist.status')} htmlFor="wish-status">
                {(a) => (
                  <select
                    id="wish-status"
                    className="input"
                    value={draft.status}
                    onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                    {...a}
                  >
                    {draft.status === 'achieved' && (
                      <option value="achieved" disabled>
                        {t('wishlist.achieved')}
                      </option>
                    )}
                    <option value="saving">{t('wishlist.saving')}</option>
                    <option value="paused">{t('wishlist.paused')}</option>
                  </select>
                )}
              </FormField>
            )}

            {formError && (
              <div className="field-error" role="alert">
                <Icon name="warning" />
                <span>{formError}</span>
              </div>
            )}
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title={t('wishlist.removeTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeWish} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {t('wishlist.removeBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t('wishlist.removeBody', { title: removing.title, saved: money(removing.savedAmount) })}
          </p>
          {formError && (
            <div className="field-error mt-3" role="alert">
              <Icon name="warning" />
              <span>{formError}</span>
            </div>
          )}
        </Modal>
      )}

      {move && (
        <Modal
          title={
            move.item
              ? move.kind === 'deposit'
                ? t('wishlist.moveDepositWish', { title: move.item.title })
                : t('wishlist.moveWithdrawWish', { title: move.item.title })
              : move.kind === 'deposit'
                ? t('wishlist.moveDepositJar')
                : t('wishlist.moveWithdrawJar')
          }
          onClose={() => setMove(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setMove(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="wish-move-form" className="btn btn-primary" disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {move.kind === 'deposit' ? t('wishlist.addToJar') : t('wishlist.takeOut')}
              </button>
            </>
          }
        >
          <p className="smallish muted">{t('wishlist.moveBody')}</p>
          <form id="wish-move-form" onSubmit={submitMove} noValidate>
            <FormField label={t('ui.amount')} htmlFor="move-amount">
              {(a) => (
                <div className="amount-wrap">
                  <span className="amount-prefix" aria-hidden="true">
                    {ledgerCurrencySymbol()}
                  </span>
                  <input
                    id="move-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={moveForm.amount}
                    onChange={(e) => setMoveForm((f) => ({ ...f, amount: e.target.value }))}
                    {...a}
                  />
                </div>
              )}
            </FormField>

            <FormField label={t('wishlist.noteOptional')} htmlFor="move-note" help={t('wishlist.moveNoteHelp')}>
              {(a) => (
                <input
                  id="move-note"
                  className="input"
                  type="text"
                  maxLength={140}
                  value={moveForm.note}
                  onChange={(e) => setMoveForm((f) => ({ ...f, note: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            {moveError && (
              <div className="field-error" role="alert">
                <Icon name="warning" />
                <span>{moveError}</span>
              </div>
            )}
          </form>
        </Modal>
      )}
    </Page>
  );
}

/**
 * The bar under each wish. The fill turns the app's green (light theme) and
 * mint (dark theme) once the target is reached, and the state is repeated in
 * the icon and the word so it never depends on seeing colour (design.md §3).
 */
function WishBar({ item }) {
  const { t } = useLocale();
  const reached = item.status === 'achieved' || item.progress >= 1;
  const width = Math.max(0, Math.min(100, item.pct));
  const state = reached
    ? t('wishlist.achieved')
    : item.status === 'paused'
      ? t('wishlist.paused')
      : t('wishlist.saving');

  return (
    <div className="mt-3">
      <div className="d-flex justify-content-between smallish mb-1">
        <span>
          <Icon name={reached ? 'checkCircle' : 'hourglass'} size={15} /> {state}
        </span>
        <span className="num">{item.pct}%</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={item.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('wishlist.pctAria', { title: item.title, pct: item.pct })}
      >
        <div
          className="progress-fill"
          style={{ width: `${width}%`, background: reached ? 'var(--cc-income)' : 'var(--cc-accent)' }}
        />
      </div>
    </div>
  );
}
