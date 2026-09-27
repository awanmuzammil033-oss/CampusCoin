import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { LedgerHead, MatchBanner, MismatchBanner, MoneyCell, TypeTag, ledgerAmount, typeKey } from '../components/GroupLedger.jsx';

/**
 * The trial balance (GRP-5): every account in this group's books, the balance on
 * each side, and the proof that the two columns are the same number.
 *
 * This screen has one job, and everything on it serves it. It is a TABLE, not a
 * chart, and there is no "view as chart" here to switch off: a picture of a
 * trial balance says nothing that five columns and a totals row do not say
 * better, and a chart of two bars that happen to be equal would be the one
 * place a reader could not check anything.
 *
 * The two columns carry each account's BALANCE on the side its type belongs to,
 * which is what makes the table add up: the Debit column, added down, is the
 * Debits total, and the Credit column, added down, is the Credits total. The
 * per-account movement the server also sends is deliberately not put in these
 * columns — a reader who added the column on the screen and got a different
 * number from the total underneath it would be right to stop trusting the page.
 * The movement is a question for the journal, which is one link away.
 *
 * `balanced` is printed, not assumed. The server validates every entry on the
 * way in, so the two columns should always agree — and a check that cannot say
 * "these do not add up" is a decoration rather than a check. When they do not,
 * this says so in the danger surface, with the figure, at the top.
 */

export default function GroupTrialBalancePage() {
  const { t, ledgerCurrency } = useLocale();
  const { push } = useToast();
  const params = useParams();
  // Mounted as /groups/:groupId/trial-balance; `params.id` read as well so the
  // screen works whichever name the mount path used.
  const groupId = params.groupId || params.id;

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);

  function load() {
    if (!groupId) return Promise.resolve();
    return Promise.all([
      api.get(`/api/groups/${groupId}/ledger/trial-balance`),
      api.get(`/api/groups/${groupId}`),
    ])
      .then(([trial, group]) => {
        // The read names the accounts `rows`; the contract for this screen calls
        // them `accounts`. Reading both is one line and keeps the page working
        // whichever name the answer arrives under.
        setData({
          group: trial.group || group.group || {},
          rows: trial.rows || trial.accounts || [],
          totals: trial.totals || { debits: 0, credits: 0 },
          balanced: trial.balanced === true,
          context: trial.context || { bills: { count: 0, total: 0 }, settlements: { count: 0, total: 0 } },
        });
        setError('');
        setGone(false);
      })
      .catch((err) => {
        const lost = err.status === 404 || err.status === 403;
        setError(err.message);
        if (lost) setGone(true);
        else push(err.message, 'error');
      });
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, push]);

  /* ------------------------------------------------------------- the frame -- */

  const backLink = (
    <Link
      className="icon-btn"
      to={groupId ? `/groups/${groupId}` : '/groups'}
      aria-label={t('ledger.backToGroup')}
      title={t('ledger.backToGroup')}
    >
      <Icon name="arrowLeft" />
    </Link>
  );

  function shell(body) {
    return (
      <Page
        trail={[{ label: t('groups.title'), to: '/groups' }, { label: data?.group?.name || t('groups.notFound') }]}
        title={t('ledger.trial.title')}
        actions={backLink}
      >
        {body}
      </Page>
    );
  }

  if (gone || !groupId) {
    return (
      <Page
        trail={[{ label: t('groups.title'), to: '/groups' }, { label: t('groups.notFound') }]}
        title={t('ledger.trial.title')}
        actions={backLink}
      >
        <div className="card">
          <EmptyState
            icon="scale"
            title={t('ledger.goneTitle')}
            action={
              <Link className="btn btn-secondary mt-2" to="/groups">
                {t('groups.back')}
              </Link>
            }
          >
            {t('ledger.goneBody')}
          </EmptyState>
        </div>
      </Page>
    );
  }

  if (!data && error) {
    return (
      <Page
        trail={[{ label: t('groups.title'), to: '/groups' }, { label: t('groups.notFound') }]}
        title={t('ledger.trial.title')}
        actions={backLink}
      >
        <div className="card">
          <EmptyState
            icon="warning"
            title={t('ledger.errorTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={load}>
                {t('ledger.retry')}
              </button>
            }
          >
            {error}
          </EmptyState>
        </div>
      </Page>
    );
  }

  if (!data) {
    return shell(
      <div className="card" role="status">
        <div className="skeleton" style={{ height: 40, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 160, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 80 }} />
        <p className="smallish muted mb-0 mt-3">{t('ledger.loading')}</p>
      </div>
    );
  }

  /* ---------------------------------------------------------- the screen -- */

  const currency = data.group?.currency || ledgerCurrency || '';
  const accounts = [...data.rows].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const { debits, credits, gap } = columnsOf(data.totals);

  return (
    <>
      <LedgerHead
        group={data.group}
        currency={currency}
        current="trial"
        titleKey="ledger.trial.title"
        noteKey="ledger.trial.subtitle"
      />

      {data.balanced ? (
        <MatchBanner
          title={t('ledger.trial.balanced', {
            debits: ledgerAmount(debits / 100, currency),
            credits: ledgerAmount(credits / 100, currency),
          })}
        />
      ) : (
        <MismatchBanner
          title={t('ledger.outBy', { amount: ledgerAmount(Math.abs(gap) / 100, currency) })}
          body={t('ledger.trial.unbalancedBody')}
        />
      )}

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('ledger.retry')}
          </button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card">
          <EmptyState icon="scale" title={t('ledger.trial.emptyTitle')}>
            {t('ledger.trial.emptyBody')}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="card cc-ledger-table">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <span className="smallish muted">{t('ledger.trial.tableNote')}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  download(t, accounts, data.totals, gap);
                  push(t('ledger.trial.downloaded'));
                }}
              >
                <Icon name="download" size={15} /> {t('ledger.trial.download')}
              </button>
            </div>

            <div className="table-scroll">
              <table className="table cc-stack-table">
                <caption className="visually-hidden">{t('ledger.trial.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('ledger.col.code')}</th>
                    <th scope="col">{t('ledger.col.account')}</th>
                    <th scope="col">{t('ledger.col.type')}</th>
                    <th scope="col" className="text-end">
                      {t('ledger.debit')}
                    </th>
                    <th scope="col" className="text-end">
                      {t('ledger.credit')}
                    </th>
                    <th scope="col" className="text-end">
                      {t('ledger.col.balance')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.code}>
                      <td data-label={t('ledger.col.code')} className="num">
                        {account.code}
                      </td>
                      <td data-label={t('ledger.col.account')}>{account.name}</td>
                      <td data-label={t('ledger.col.type')}>
                        <TypeTag type={account.type} />
                      </td>
                      <td data-label={t('ledger.debit')} className="text-end">
                        <MoneyCell value={account.side === 'debit' ? account.balance : 0} currency={currency} blank={account.side !== 'debit'} />
                      </td>
                      <td data-label={t('ledger.credit')} className="text-end">
                        <MoneyCell
                          value={account.side === 'credit' ? -Number(account.balance || 0) : 0}
                          currency={currency}
                          blank={account.side !== 'credit'}
                        />
                      </td>
                      <td data-label={t('ledger.col.balance')} className="text-end">
                        <MoneyCell
                          value={account.balance}
                          currency={currency}
                          tone={Number(account.balance) < 0 ? 'alarm' : 'plain'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* the class is on the tfoot, so the stacked-table rules at 700px
                    can be told to flatten this row's cells along with the rest */}
                <tfoot className="cc-ledger-total-row">
                  <tr>
                    <th scope="row" colSpan={3} className="text-start">
                      {t('ledger.trial.totals')}
                    </th>
                    <td className="text-end num">{ledgerAmount(debits / 100, currency)}</td>
                    <td className="text-end num">{ledgerAmount(credits / 100, currency)}</td>
                    <td className="text-end num">
                      <MoneyCell value={gap / 100} currency={currency} tone={gap === 0 ? 'plain' : 'alarm'} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card cc-ledger-context">
            <div className="card-title">
              <span>{t('ledger.trial.contextTitle')}</span>
            </div>
            <ul className="cc-ledger-context-list">
              <li>
                <Icon name="receipt" size={15} />
                <span>
                  {t('ledger.trial.contextBills', { count: data.context.bills?.count || 0, total: ledgerAmount(data.context.bills?.total, currency) })}
                </span>
              </li>
              <li>
                <Icon name="coins" size={15} />
                <span>
                  {t('ledger.trial.contextSettlements', {
                    count: data.context.settlements?.count || 0,
                    total: ledgerAmount(data.context.settlements?.total, currency),
                  })}
                </span>
              </li>
            </ul>
            <p className="smallish muted mb-0">{t('ledger.trial.contextNote')}</p>
          </div>
        </>
      )}

      <p className="smallish muted mt-2">
        <Icon name="info" size={14} /> {t('ledger.trial.readOnly')}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ helpers -- */

/**
 * The two column totals, in whole cents, and the gap between them. This is the
 * only arithmetic on the page and it is a subtraction of two numbers the server
 * sent: "out by" has to name a figure, and the difference of two halves of the
 * same claim IS the claim being made. Nothing here invents a total.
 */
function columnsOf(totals) {
  const debits = Math.round((Number(totals?.debits) || 0) * 100);
  const credits = Math.round((Number(totals?.credits) || 0) * 100);
  return { debits, credits, gap: debits - credits };
}

/** A number for a spreadsheet: two decimals, no symbol, no thousands comma. */
function plain(value) {
  return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

/**
 * A text cell, made safe to open in a spreadsheet. Only the words are
 * neutralised: a cell that starts with =, +, - or @ would otherwise be run as
 * a formula, and a memo is not a formula. The amount columns are numbers this
 * file formatted itself, so they cannot be one.
 */
function cell(value) {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * The rows on screen, as a CSV. The same Blob → anchor → revoke dance the
 * report's image export already uses, and the same rule: it runs on the click
 * and on nothing else. The header row is the table's own headings, so the file
 * reads in the language the reader picked, and a leading BOM keeps the file
 * readable in a spreadsheet that would otherwise guess the encoding.
 */
function download(t, accounts, totals, gap) {
  const head = [
    t('ledger.col.code'),
    t('ledger.col.account'),
    t('ledger.col.type'),
    t('ledger.debit'),
    t('ledger.credit'),
    t('ledger.col.balance'),
  ];
  const body = accounts.map((account) => [
    cell(account.code),
    cell(account.name),
    cell(t(typeKey(account.type))),
    plain(account.side === 'debit' ? account.balance : 0),
    plain(account.side === 'credit' ? -Number(account.balance || 0) : 0),
    plain(account.balance),
  ]);
  const foot = [t('ledger.trial.totals'), '', '', plain(totals?.debits), plain(totals?.credits), plain(gap / 100)];

  const text = [head, ...body, foot]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // A leading BOM, so a spreadsheet does not guess the encoding and turn the
  // account names into question marks.
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'campuscoin-trial-balance.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
