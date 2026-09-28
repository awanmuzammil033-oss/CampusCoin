import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { WalletCards } from '../components/WalletCards.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money, moneyInLedger, ledgerCurrencySymbol } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

/** How many movements the history panel reads at a time (the server caps at 100). */
const HISTORY = 25;

/** The three kinds, in the order the dictionary words them. */
const KINDS = ['cash', 'bank', 'mobile'];

/** Written out rather than built at runtime: a key nobody can grep for is a key
 *  nobody translates, and this is the one list the whole feature hangs on. */
const KIND_KEYS = {
  cash: 'wallet.kindCash',
  bank: 'wallet.kindBank',
  mobile: 'wallet.kindMobile',
};

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function asDay(value) {
  return String(value || '').slice(0, 10);
}

/**
 * Wallets (NEW-11, client side).
 *
 * Four parts, in the order a student meets them: the pockets and what each one
 * holds, the entries that are not in any of them, the movements between them,
 * and the two forms.
 *
 * Three things this screen will not do, because each of them has been the
 * obvious thing to do and each of them is wrong:
 *
 *  1. It adds no total. A sum of the wallets is not the student's balance: that
 *     one is income minus expense, and the wallets also carry the opening
 *     amounts the student typed in plus anything not yet filed to a pocket. The
 *     line under the cards says so instead of printing a number that would
 *     disagree with the balance card on the dashboard.
 *  2. It never makes a move look like spending. A movement is one record with
 *     two ends; it never reaches an income figure, an expense figure, a budget,
 *     a chart or a report, so it is not drawn in the app's expense colour and
 *     not given the app's expense glyph. The direction is a colour AND a word.
 *  3. It does not hide a closed wallet. Closing archives; the entries that
 *     point at the wallet still resolve and its movements still name it, so it
 *     keeps a card, a figure and a place in the history filter.
 *
 * Every figure on this page is the server's. The page sums nothing.
 */
export default function WalletsPage() {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [month] = useState(() => monthKey(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // the movement panel reads on its own, because its filter is its own state
  const [historyFilter, setHistoryFilter] = useState('');
  const [moves, setMoves] = useState(null);
  const [movesError, setMovesError] = useState('');
  const [version, setVersion] = useState(0);

  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState('');
  const [closing, setClosing] = useState(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveForm, setMoveForm] = useState({ fromId: '', toId: '', amount: '', date: '', note: '' });
  const [moveError, setMoveError] = useState('');

  /**
   * Two reads, because no single endpoint carries all of it: the balances read
   * is the only one that has the month figures and the unfiled count, and the
   * plain read with `archived=1` is the only one that has a closed wallet and
   * says which one takes new entries.
   */
  async function load() {
    try {
      const [balances, all] = await Promise.all([
        api.get(`/api/wallets/balances${qs({ month })}`),
        api.get('/api/wallets?archived=1'),
      ]);
      setData({
        wallets: balances.wallets || [],
        unfiled: Number(balances.unfiled) || 0,
        closed: (all.wallets || []).filter((w) => w.isActive === false),
        defaultId: all.defaultId || null,
      });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    let alive = true;
    const url = historyFilter
      ? `/api/wallets/${historyFilter}/history${qs({ limit: HISTORY })}`
      : `/api/wallets/history/all${qs({ limit: HISTORY })}`;
    setMoves(null);
    setMovesError('');
    api
      .get(url)
      .then((res) => {
        if (alive) setMoves(res.rows || []);
      })
      .catch((err) => {
        if (!alive) return;
        setMoves([]);
        setMovesError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [historyFilter, version]);

  /** A write is finished: re-read everything the page shows, history included. */
  function refresh() {
    setVersion((n) => n + 1);
    return load();
  }

  /* ------------------------------- the wallets ----------------------------- */

  function openWallet(wallet) {
    setFormError('');
    setDraft(
      wallet
        ? {
            id: wallet.id,
            name: wallet.name,
            kind: KINDS.includes(wallet.kind) ? wallet.kind : 'cash',
            hint: wallet.hint || '',
            // an opening balance that was never set has to open as an EMPTY
            // box: pre-filling it with 0 would write down a decision nobody made
            openingBalance: wallet.openingBalance === null ? '' : String(wallet.openingBalance),
            isDefault: wallet.isDefault === true,
          }
        : { id: null, name: '', kind: 'cash', hint: '', openingBalance: '', isDefault: false }
    );
  }

  async function saveWallet(event) {
    event.preventDefault();
    setFormError('');

    const opening = String(draft.openingBalance).trim();
    const body = {
      name: draft.name.trim(),
      kind: draft.kind,
      hint: draft.hint.trim(),
      // '' and null are the same request: "never set", which is not the same
      // fact as zero and the server keeps the two apart
      openingBalance: opening === '' ? null : opening,
    };
    // only ever `true` is sent: the server refuses to un-default the one default
    if (draft.isDefault) body.isDefault = true;

    setBusy(true);
    try {
      if (draft.id) await api.patch(`/api/wallets/${draft.id}`, body);
      else await api.post('/api/wallets', body);
      setDraft(null);
      const name = draft.name.trim();
      push(draft.id ? t('wallet.updated', { name }) : t('wallet.added', { name }));
      await refresh();
    } catch (err) {
      // the server names what is wrong, in a sentence; it is shown as it arrived
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeWallet() {
    const target = closing;
    setBusy(true);
    try {
      await api.del(`/api/wallets/${target.id}`);
      setClosing(null);
      push(t('wallet.closed', { name: target.name }));
      await refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------ move the money --------------------------- */

  function openMove(wallet) {
    setMoveError('');
    const open = data?.wallets || [];
    const fromId = wallet?.id || '';
    setMoveForm({
      fromId,
      toId: (open.find((w) => w.id !== fromId) || {}).id || '',
      amount: '',
      date: todayISO(),
      note: '',
    });
    setMoveOpen(true);
  }

  async function submitMove(event) {
    event.preventDefault();
    setMoveError('');

    if (!moveForm.fromId || !moveForm.toId) {
      setMoveError(t('wallet.movePickBoth'));
      return;
    }
    if (moveForm.fromId === moveForm.toId) {
      setMoveError(t('wallet.moveSame'));
      return;
    }
    const typed = String(moveForm.amount).trim();
    if (!typed || !(Number(typed) > 0)) {
      setMoveError(t('wallet.moveAmount'));
      return;
    }

    const body = {
      fromId: moveForm.fromId,
      toId: moveForm.toId,
      amount: typed,
      date: moveForm.date,
      note: moveForm.note.trim(),
    };

    setBusy(true);
    try {
      const res = await api.post('/api/wallets/transfer', body);
      const nameOf = (id) => (data?.wallets.find((w) => w.id === id) || {}).name || '';
      // the answer carries every balance again, so the two cards that moved do
      // not have to be asked about. Only the balance is taken from it: a
      // movement does not change this month's income or expenses, and a closed
      // wallet cannot be an end of one, so its figure did not move either.
      const fresh = new Map((res.wallets || []).map((w) => [w.id, w.balance]));
      setData((d) =>
        d
          ? { ...d, wallets: d.wallets.map((w) => (fresh.has(w.id) ? { ...w, balance: fresh.get(w.id) } : w)) }
          : d
      );
      setMoveOpen(false);
      // a typed amount is a ledger amount: moneyInLedger never converts it
      push(
        t('wallet.moved', {
          amount: moneyInLedger(typed),
          from: nameOf(moveForm.fromId),
          to: nameOf(moveForm.toId),
        })
      );
      setVersion((n) => n + 1);
    } catch (err) {
      setMoveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------------- render -------------------------------- */

  const wallets = data?.wallets || [];
  const closed = data?.closed || [];
  const unfiled = data?.unfiled || 0;
  // the default wallet cannot be closed while another one is open, so the card
  // that would only error says why instead of offering the button
  const canClose = (wallet) => !(wallet.isDefault === true && wallets.length > 1);

  return (
    <Page
      trail={[{ label: t('wallet.title') }]}
      title={t('wallet.title')}
      subtitle={t('wallet.subtitle')}
      actions={
        <>
          {/* left enabled even with one wallet: the modal then says why, which is
              more use to the reader than a dead button */}
          <button type="button" className="btn btn-secondary" onClick={() => openMove(null)}>
            <Icon name="exchange" /> {t('wallet.moveBtn')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openWallet(null)}>
            <Icon name="plus" /> {t('wallet.addBtn')}
          </button>
        </>
      }
    >
      <div className="card-title">
        <span>
          <Icon name="wallet" /> {t('wallet.listTitle')}
        </span>
      </div>

      <WalletCards
        wallets={wallets}
        month={month}
        defaultId={data?.defaultId}
        loading={!data && !error}
        error={error}
        onRetry={load}
        onEdit={openWallet}
        onMove={openMove}
        onClose={(wallet) => {
          setFormError('');
          setClosing(wallet);
        }}
        canClose={canClose}
        emptyAction={
          <button type="button" className="btn btn-primary mt-2" onClick={() => openWallet(null)}>
            <Icon name="plus" /> {t('wallet.emptyBtn')}
          </button>
        }
      />

      {data && (
        <p className="smallish muted cc-wallet-note mt-3">
          <Icon name="info" size={15} /> {t('wallet.sumNote')}
        </p>
      )}

      {closed.length > 0 && (
        <section className="mt-4" aria-label={t('wallet.closedTitle')}>
          <div className="card-title">
            <span>{t('wallet.closedTitle')}</span>
            <span className="pill num">{closed.length}</span>
          </div>
          <WalletCards wallets={closed} month={month} />
        </section>
      )}

      {data && unfiled > 0 && (
        <section className="card cc-wallet-note mt-3" aria-label={t('wallet.unfiledTitle')}>
          <div className="card-title">
            <span>
              <Icon name="inbox" /> {t('wallet.unfiledTitle')}
            </span>
            <span className="pill num">{unfiled}</span>
          </div>
          <p className="mb-0">{t('wallet.unfiledBody')}</p>
          <p className="smallish muted mb-0 mt-2">{t('wallet.unfiledHow')}</p>
        </section>
      )}

      {/* ------------------------------ the movements -------------------------- */}
      <section className="card mt-4" aria-label={t('wallet.historyTitle')}>
        <div className="card-title">
          <span>
            <Icon name="exchange" /> {t('wallet.historyTitle')}
          </span>
          {moves && moves.length > 0 && (
            <span className="pill num">{plural('wallet.historyCount', moves.length, { n: moves.length })}</span>
          )}
        </div>

        <p className="smallish muted">{t('wallet.historyNote')}</p>

        <FormField label={t('wallet.historyFilter')} htmlFor="wallet-history-filter">
          {(a) => (
            <select
              id="wallet-history-filter"
              className="input"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              {...a}
            >
              <option value="">{t('wallet.historyAll')}</option>
              {/* a closed wallet is in this list too, or its movements would have
                  nowhere to be read from */}
              {[...wallets, ...closed].map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {moves === null && (
          <div role="status">
            <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 20, width: '45%' }} />
            <p className="smallish muted mb-0 mt-3">{t('wallet.historyLoading')}</p>
          </div>
        )}

        {movesError && (
          <div className="field-error" role="alert">
            <Icon name="warning" />
            <span>{movesError}</span>
          </div>
        )}

        {moves && moves.length === 0 && !movesError && (
          <EmptyState icon="exchange" title={t('wallet.historyEmptyTitle')}>
            {t('wallet.historyEmptyBody')}
          </EmptyState>
        )}

        {moves && moves.length > 0 && (
          <ul className="cc-wallet-movements" role="list">
            {moves.map((row) => (
              <Movement key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------- add / edit a wallet ---------------------- */}
      {draft && (
        <Modal
          title={draft.id ? t('wallet.editTitle') : t('wallet.addTitle')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="wallet-form" className="btn btn-primary" disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {draft.id ? t('wallet.saveBtn') : t('wallet.addBtn')}
              </button>
            </>
          }
        >
          <form id="wallet-form" onSubmit={saveWallet} noValidate>
            <FormField label={t('ui.name')} htmlFor="wallet-name" help={t('wallet.nameHelp')}>
              {(a) => (
                <input
                  id="wallet-name"
                  className="input"
                  type="text"
                  maxLength={40}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('wallet.kindField')} htmlFor="wallet-kind" help={t('wallet.kindHelp')}>
              {(a) => (
                <select
                  id="wallet-kind"
                  className="input"
                  value={draft.kind}
                  onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
                  {...a}
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(KIND_KEYS[kind])}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={t('wallet.hintField')} htmlFor="wallet-hint" help={t('wallet.hintHelp')}>
              {(a) => (
                <input
                  id="wallet-hint"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={draft.hint}
                  onChange={(e) => setDraft((d) => ({ ...d, hint: e.target.value.replace(/\D/g, '') }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField
              label={t('wallet.openingLabel')}
              htmlFor="wallet-opening"
              help={t('wallet.openingHelp')}
            >
              {(a) => (
                <div className="amount-wrap">
                  <span className="amount-prefix" aria-hidden="true">
                    {ledgerCurrencySymbol()}
                  </span>
                  <input
                    id="wallet-opening"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.openingBalance}
                    onChange={(e) => setDraft((d) => ({ ...d, openingBalance: e.target.value }))}
                    {...a}
                  />
                </div>
              )}
            </FormField>

            <FormField label={t('wallet.makeDefault')} htmlFor="wallet-default" help={t('wallet.makeDefaultHelp')}>
              {(a) => (
                <input
                  id="wallet-default"
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
                  {...a}
                />
              )}
            </FormField>

            {formError && (
              <div className="field-error" role="alert">
                <Icon name="warning" />
                <span>{formError}</span>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* ------------------------------- close a wallet ------------------------- */}
      {closing && (
        <Modal
          title={t('wallet.closeTitle')}
          onClose={() => setClosing(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setClosing(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={closeWallet} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {t('wallet.closeBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">{t('wallet.closeBody', { name: closing.name })}</p>
          {formError && (
            <div className="field-error mt-3" role="alert">
              <Icon name="warning" />
              <span>{formError}</span>
            </div>
          )}
        </Modal>
      )}

      {/* ----------------------------- move the money --------------------------- */}
      {moveOpen && (
        <Modal
          title={t('wallet.moveTitle')}
          onClose={() => setMoveOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setMoveOpen(false)}>
                {t('ui.cancel')}
              </button>
              <button
                type="submit"
                form="wallet-move-form"
                className="btn btn-primary"
                disabled={busy || wallets.length < 2}
              >
                {busy && <span className="spinner" aria-hidden="true" />}
                {t('wallet.moveSubmit')}
              </button>
            </>
          }
        >
          <p className="smallish muted">{t('wallet.moveNotSpending')}</p>

          {wallets.length < 2 && (
            <p className="smallish muted d-flex align-items-start gap-2">
              <Icon name="info" size={15} /> {t('wallet.moveNeedTwo')}
            </p>
          )}

          <form id="wallet-move-form" onSubmit={submitMove} noValidate>
            <FormField label={t('ui.from')} htmlFor="wallet-move-from">
              {(a) => (
                <select
                  id="wallet-move-from"
                  className="input"
                  value={moveForm.fromId}
                  onChange={(e) => setMoveForm((f) => ({ ...f, fromId: e.target.value }))}
                  {...a}
                >
                  <option value="">{t('wallet.chooseWallet')}</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {t('wallet.pickerOption', { name: wallet.name, amount: money(wallet.balance) })}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={t('ui.to')} htmlFor="wallet-move-to">
              {(a) => (
                <select
                  id="wallet-move-to"
                  className="input"
                  value={moveForm.toId}
                  onChange={(e) => setMoveForm((f) => ({ ...f, toId: e.target.value }))}
                  {...a}
                >
                  <option value="">{t('wallet.chooseWallet')}</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {t('wallet.pickerOption', { name: wallet.name, amount: money(wallet.balance) })}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={t('ui.amount')} htmlFor="wallet-move-amount" help={t('wallet.moveAmountHelp')}>
              {(a) => (
                <div className="amount-wrap">
                  <span className="amount-prefix" aria-hidden="true">
                    {ledgerCurrencySymbol()}
                  </span>
                  <input
                    id="wallet-move-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={moveForm.amount}
                    onChange={(e) => setMoveForm((f) => ({ ...f, amount: e.target.value }))}
                    {...a}
                  />
                </div>
              )}
            </FormField>

            <FormField label={t('ui.date')} htmlFor="wallet-move-date">
              {(a) => (
                <input
                  id="wallet-move-date"
                  className="input"
                  type="date"
                  value={moveForm.date}
                  onChange={(e) => setMoveForm((f) => ({ ...f, date: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ui.note')} htmlFor="wallet-move-note" help={t('wallet.moveNoteHelp')}>
              {(a) => (
                <input
                  id="wallet-move-note"
                  className="input"
                  type="text"
                  maxLength={120}
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
 * One movement, read as one movement.
 *
 * The two ends are named on the row, the amount is printed with no sign and no
 * plus/minus (those are the ledger's marks and would read as income and
 * expense), and the direction chip is a colour AND a word — `in` is the app's
 * green because money arrived, `out` is the plain surface because money
 * leaving one pocket for another is not spending, and a row read with no
 * filter is marked "Moved". The arrow is a direction mark, deliberately not the
 * trend glyph the ledger pairs with an expense.
 */
function Movement({ row }) {
  const { t } = useLocale();
  const from = row.from?.name || '';
  const to = row.to?.name || '';
  const date = dayLabel(asDay(row.date));

  const chip =
    row.direction === 'in'
      ? { cls: 'pill pill-income', icon: 'arrowDown', key: 'wallet.directionIn' }
      : row.direction === 'out'
        ? { cls: 'pill', icon: 'arrowUp', key: 'wallet.directionOut' }
        : { cls: 'pill', icon: 'exchange', key: 'wallet.directionMoved' };

  return (
    <li className="cc-wallet-movement">
      <span className={`${chip.cls} cc-wallet-direction`}>
        <Icon name={chip.icon} size={13} /> {t(chip.key)}
      </span>

      <span className="cc-wallet-head">
        <span className="cc-wallet-name">
          {from} <Icon name="arrowRight" size={13} /> {to}
        </span>
        <span className="smallish muted">
          {date}
          {row.note ? ` · ${row.note}` : ''}
        </span>
      </span>

      <span className="num cc-wallet-amount ms-auto">{money(row.amount)}</span>
    </li>
  );
}
