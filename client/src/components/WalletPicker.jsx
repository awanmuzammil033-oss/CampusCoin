import { useEffect, useId, useState } from 'react';

import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';

/**
 * The wallet picker for an entry form (NEW-11).
 *
 * Dropped into the transaction form as
 *   <WalletPicker value={form.walletId} onChange={(v) => setField('walletId', v)} />
 * and nothing else there has to change: the label, the help, the four states and
 * the notes all live in here. It sends and receives a wallet id, which is the
 * field the transactions service reads (`walletId`) — a wallet is never guessed
 * from the amount or the category, so an entry with no pocket picked is an
 * honest "not filed" rather than a quiet guess at the bank account.
 *
 * It fetches `/api/wallets/balances` only when no list is handed to it, and
 * that call is the only one that also returns `unfiled` — the number of entries
 * with no pocket on them. A caller that passes its own `wallets` already has
 * that count in hand, so the short line is left to the caller rather than
 * costing a second request on every keystroke of another form.
 */
export default function WalletPicker({ value, onChange, wallets, label, hint, allowEmpty = true }) {
  const { t, plural } = useLocale();
  // `useId` is stable across renders, which is what keeps the label pointing at
  // the same select when the list arrives; the colons are dropped because they
  // are legal in an id but awkward in anything that later queries it.
  const reactId = useId();
  const id = `wallet-pick-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const given = Array.isArray(wallets);
  const [own, setOwn] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (given) return undefined;
    let alive = true;
    setLoadError('');
    api
      .get('/api/wallets/balances')
      .then((data) => {
        if (alive) setOwn({ wallets: data.wallets || [], unfiled: Number(data.unfiled) || 0 });
      })
      .catch((err) => {
        if (alive) setLoadError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [given, attempt]);

  const list = given ? wallets : own?.wallets || [];
  const unfiled = given ? 0 : own?.unfiled || 0;
  const ready = given || Boolean(own);
  const failed = !given && Boolean(loadError);
  // a failed read is not a pending one: the placeholder says "no pocket", never
  // "loading", or the form looks stuck on a request that is already over
  const placeholder = failed ? t('wallet.pickerNone') : t('wallet.pickerLoading');

  // While the list is on its way the select carries a placeholder rather than
  // the caller's saved value, so a wallet that has since been closed cannot be
  // re-submitted as if it were still open.
  const selected = ready ? value ?? '' : '';

  // and once the list HAS arrived, a saved value that is not in it (a wallet
  // closed in another tab) is handed back as empty rather than submitted again
  useEffect(() => {
    if (!ready || !value) return;
    if (list.some((w) => w.id === value)) return;
    onChange?.(allowEmpty ? '' : list[0]?.id || '');
  }, [ready, value, list, allowEmpty, onChange]);

  return (
    <div className="cc-wallet-picker">
      <FormField label={label || t('wallet.pickerLabel')} htmlFor={id} help={hint || t('wallet.pickerHelp')}>
        {(a) => (
          <select
            id={id}
            className="input"
            value={selected}
            disabled={!ready}
            onChange={(e) => onChange?.(e.target.value)}
            {...a}
          >
            {(!ready || allowEmpty) && (
              <option value="">{ready ? t('wallet.pickerNone') : placeholder}</option>
            )}
            {list.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {/* an option is the one place in a form with room for the
                    balance, and it is what tells two accounts apart */}
                {wallet.balance === null || wallet.balance === undefined
                  ? t('wallet.pickerOptionBare', { name: wallet.name })
                  : t('wallet.pickerOption', { name: wallet.name, amount: money(wallet.balance) })}
              </option>
            ))}
          </select>
        )}
      </FormField>

      {ready && list.length === 0 && (
        <p className="smallish muted mb-0">
          <Icon name="info" size={15} /> {t('wallet.pickerNoneYet')}
        </p>
      )}

      {failed && (
        <div className="cc-wallet-note" role="alert">
          <p className="smallish mb-0">
            <Icon name="warning" size={15} /> {t('wallet.pickerFailed')}
          </p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="repeat" size={17} /> {t('wallet.retry')}
          </button>
        </div>
      )}

      {!given && unfiled > 0 && (
        <p className="smallish muted cc-wallet-note mb-0">
          <Icon name="info" size={15} /> {plural('wallet.unfiledShort', unfiled, { n: unfiled })}
        </p>
      )}
    </div>
  );
}
