import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import { money } from '../money.js';
import { monthLabel } from '../dates.js';
import { useLocale } from '../locale.jsx';

/**
 * The vocabulary of a wallet, in one place.
 *
 * The three kinds are a closed list on the server (an open one would put a raw
 * string on the screen), and the wording and the glyph for each belong to the
 * dictionary. The picker and the page both read `kindLabel` and `walletIcon`
 * from here rather than keeping their own copy: a card that says "Mobile
 * wallet" and a picker that says "Phone" for the same pocket is a bug nobody
 * would notice until two students compared screens.
 */
const KINDS = {
  cash: { key: 'wallet.kindCash', icon: 'coins' },
  bank: { key: 'wallet.kindBank', icon: 'bank' },
  mobile: { key: 'wallet.kindMobile', icon: 'phone' },
};

/** The kind this build does not know. Reached only if the server grows first. */
const UNKNOWN_KIND = { key: 'wallet.kindUnknown', icon: 'wallet' };

/** "Mobile wallet" for a kind, never the raw word the server sent. */
export function kindLabel(t, kind) {
  return t((KINDS[kind] || UNKNOWN_KIND).key);
}

/** The card's own icon, falling back to the one its kind carries. */
export function walletIcon(wallet) {
  return wallet?.icon || (KINDS[wallet?.kind] || UNKNOWN_KIND).icon;
}

/** "September 2026" for a 'YYYY-MM' key — the month the figures below are for. */
function monthTitle(month) {
  const [year, m] = String(month || '').slice(0, 7).split('-').map(Number);
  return monthLabel(year && m ? new Date(year, m - 1, 1) : new Date());
}

/**
 * The wallet row (NEW-11, client side).
 *
 * One card per wallet: what it is, what it holds now, and what moved through it
 * this month. Four states, all of them drawn here so no caller has to invent
 * one: loading, error with a retry, empty, and the list.
 *
 * Every figure is printed exactly as the server sent it. Nothing in this file
 * adds two balances up — a sum of the wallets is NOT the student's balance (it
 * also carries the opening amounts they typed in), and the page says so in a
 * line rather than showing a number that disagrees with the balance card on the
 * dashboard.
 *
 * The month figures are optional. A row that has none (the plain
 * `GET /api/wallets` shape) simply does not draw that line, because printing
 * "Out 0.00" for a month nobody asked about is a figure this component invented.
 *
 * Handlers are optional too: pass none of them and you get a read-only card,
 * which is the shape the dashboard's compact row wants.
 */
export function WalletCards({
  wallets = [],
  month = '',
  defaultId,
  loading = false,
  error = '',
  onRetry,
  onEdit,
  onMove,
  onClose,
  canClose,
  emptyAction,
}) {
  const { t, plural } = useLocale();
  const rows = Array.isArray(wallets) ? wallets : [];

  if (loading) {
    return (
      <div className="card" role="status">
        <div className="skeleton" style={{ height: 40, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 28, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '60%' }} />
        <p className="smallish muted mb-0 mt-3">{t('wallet.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <EmptyState
          icon="warning"
          title={t('wallet.errorTitle')}
          action={
            onRetry && (
              <button type="button" className="btn btn-secondary mt-2" onClick={onRetry}>
                <Icon name="repeat" /> {t('wallet.retry')}
              </button>
            )
          }
        >
          {/* the server's own sentence, as it arrived — not a reworded version */}
          <span className="cc-wallet-note-error">{error}</span>
          <br />
          {t('wallet.errorNote')}
        </EmptyState>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="wallet"
          title={t('wallet.emptyTitle')}
          action={
            emptyAction || (
              onEdit && (
                <button type="button" className="btn btn-primary mt-2" onClick={() => onEdit(null)}>
                  <Icon name="plus" /> {t('wallet.emptyBtn')}
                </button>
              )
            )
          }
        >
          {t('wallet.emptyBody')}
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <p className="smallish muted mb-2">{plural('wallet.count', rows.length, { n: rows.length })}</p>
      <ul className="cc-wallet-list" role="list">
        {rows.map((wallet) => (
          <li key={wallet.id} className="cc-wallet-card">
            <WalletCard
              wallet={wallet}
              month={month}
              defaultId={defaultId}
              onEdit={onEdit}
              onMove={onMove}
              onClose={onClose}
              canClose={canClose}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/** One wallet, drawn as a card. Split out so the month block can stay small. */
function WalletCard({ wallet, month, defaultId, onEdit, onMove, onClose, canClose }) {
  const { t } = useLocale();
  const title = monthTitle(month);
  const balance = Number(wallet.balance);
  const low = Number.isFinite(balance) && balance < 0;
  const hasMonth = wallet.monthIncome !== undefined || wallet.monthExpense !== undefined;
  // `defaultId` is the fallback for a list that carries no isDefault of its own
  const isDefault = wallet.isDefault === true || defaultId === wallet.id;
  // a control the server would refuse is not drawn at all, and the reason is
  // drawn in its place: see the default wallet on the wallets page
  const blocked = typeof canClose === 'function' && canClose(wallet) === false;
  const closable = Boolean(onClose) && !blocked;

  return (
    <div className="card h-100 d-flex flex-column">
      <div className="d-flex align-items-start gap-2">
        <span className="txn-ico">
          <Icon name={walletIcon(wallet)} />
        </span>
        <div className="cc-wallet-head">
          <h3 className="cc-wallet-name">{wallet.name}</h3>
          <p className="smallish muted mb-0 cc-wallet-kind">
            {kindLabel(t, wallet.kind)}
            {/* the hint is a nickname, so it reads as part of the name line */}
            {wallet.hint ? ` · ${t('wallet.hintLabel', { digits: wallet.hint })}` : ''}
          </p>
        </div>
        {isDefault && (
          <span className="pill ms-auto">
            <Icon name="checkCircle" size={13} /> {t('wallet.defaultBadge')}
          </span>
        )}
        {/* an archived wallet keeps a card and a figure: its entries still point
            at it, so hiding it would be hiding the reader's own history */}
        {wallet.isActive === false && (
          <span className="pill ms-auto">
            <Icon name="ban" size={13} /> {t('wallet.closedBadge')}
          </span>
        )}
      </div>

      <p className="smallish muted mb-1 mt-3">{t('wallet.balanceLabel')}</p>
      <p
        className={`cc-wallet-balance num${low ? ' cc-wallet-balance-low' : ''}`}
        aria-label={t('wallet.cardAria', { name: wallet.name, kind: kindLabel(t, wallet.kind), amount: money(balance) })}
      >
        {money(balance)}
      </p>

      {/* `null` and `0` are different facts: one is "never set", one is "empty" */}
      <p className="smallish muted mb-0">
        {wallet.openingBalance === null || wallet.openingBalance === undefined
          ? t('wallet.openingUnset')
          : t('wallet.openingSet', { amount: money(wallet.openingBalance) })}
      </p>

      {low && (
        <p className="smallish cc-wallet-balance-low mb-0 mt-1">
          <Icon name="warning" size={15} /> {t('wallet.belowZero')}
        </p>
      )}

      {hasMonth && (
        <dl className="cc-wallet-month">
          <div className="cc-wallet-figure">
            <dt>{t('wallet.monthIn', { month: title })}</dt>
            <dd className="num amount-income">{money(wallet.monthIncome)}</dd>
          </div>
          <div className="cc-wallet-figure">
            <dt>{t('wallet.monthOut', { month: title })}</dt>
            <dd className="num amount-expense">{money(wallet.monthExpense)}</dd>
          </div>
        </dl>
      )}

      {isDefault && <p className="smallish muted mb-0 mt-2">{t('wallet.defaultNote')}</p>}

      {wallet.isActive === false && (
        <p className="smallish muted mb-0 mt-2">
          <Icon name="info" size={15} /> {t('wallet.closedNote')}
        </p>
      )}

      {(onEdit || onMove || onClose) && (
        <div className="d-flex gap-2 flex-wrap cc-wallet-actions mt-auto pt-3">
          {onMove && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onMove(wallet)}
              aria-label={t('wallet.moveFromAria', { name: wallet.name })}
            >
              {/* the two-ended glyph, never the app's expense mark */}
              <Icon name="exchange" size={17} /> {t('wallet.moveBtn')}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onEdit(wallet)}
              aria-label={t('wallet.editAria', { name: wallet.name })}
            >
              <Icon name="pencil" size={17} /> {t('ui.edit')}
            </button>
          )}
          {closable && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => onClose(wallet)}
              aria-label={t('wallet.closeAria', { name: wallet.name })}
              title={t('wallet.closeBtn')}
            >
              <Icon name="ban" />
            </button>
          )}
        </div>
      )}

      {onClose && blocked && (
        <p className="smallish muted mb-0 mt-2">
          <Icon name="info" size={15} /> {t('wallet.closeDefaultHint')}
        </p>
      )}
    </div>
  );
}

/**
 * One wallet, one line — the dashboard's shape (NEW-11).
 *
 * This is the default export so the dashboard can drop a list of rows in
 * without importing the card. It is an `<li>`: put it in a
 * `<ul className="cc-wallet-list">`, which the stylesheet lays out as a grid
 * (one column on a phone, a strip on a desktop).
 *
 * Only the current balance is drawn. The month figures belong on the wallets
 * screen, where there is room to say which month they are.
 */
export default function WalletRow({ wallet, defaultId }) {
  const { t } = useLocale();
  if (!wallet) return null;

  const balance = Number(wallet.balance);
  const low = Number.isFinite(balance) && balance < 0;
  // `defaultId` is the fallback for a caller holding a list that carries no
  // isDefault of its own
  const isDefault = wallet.isDefault === true || defaultId === wallet.id;

  return (
    <li className="cc-wallet-row">
      <span className="txn-ico">
        <Icon name={walletIcon(wallet)} />
      </span>
      <span className="cc-wallet-head">
        <span className="cc-wallet-name">{wallet.name}</span>
        <span className="smallish muted cc-wallet-kind">
          {kindLabel(t, wallet.kind)}
          {wallet.hint ? ` · ${t('wallet.hintLabel', { digits: wallet.hint })}` : ''}
        </span>
      </span>
      {isDefault && (
        <span className="pill">
          <Icon name="checkCircle" size={13} /> {t('wallet.defaultBadge')}
        </span>
      )}
      <span
        className={`cc-wallet-balance num ms-auto${low ? ' cc-wallet-balance-low' : ''}`}
        aria-label={t('wallet.cardAria', { name: wallet.name, kind: kindLabel(t, wallet.kind), amount: money(balance) })}
      >
        {money(balance)}
      </span>
    </li>
  );
}
