import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { DifferencePanel, LedgerHead, MoneyCell, StatementRow, ledgerAmount, typeKey } from '../components/GroupLedger.jsx';
import { dayLabel } from '../dates.js';

/**
 * The bank reconciliation (GRP-7): the statement in one column, the group's
 * books in the other, and the difference between them in plain sight.
 *
 * A statement arrives as a list, so the list is the primary way in — a paste box
 * first, a single-line form beside it for the one line the paste got wrong. The
 * running total of what has been typed is shown against the balance the reader
 * typed, while they are still typing it, because a wrong figure in a pasted
 * statement is invisible until somebody adds it up.
 *
 * Nothing is decided in the browser. Which lines the server could pair by
 * amount and date, what each line means, the five totals, the counts, and
 * whether this can close are all its answer, and this page prints them. The one
 * figure computed here is the total of the lines the reader has typed but not
 * yet sent, which is a check on their own keystrokes rather than a statement
 * about the books.
 */

const MAX_STATEMENT_LINES = 200; // the server's cap; the paste is trimmed to it

/** The em dash a row uses where there is genuinely nothing to say. */
const NONE = '\u2014';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BLANK = { accountCode: '', statementDate: todayISO(), statementBalance: '', lines: [] };
const BLANK_LINE = { date: todayISO(), description: '', amount: '' };

/**
 * The report, whichever shape it arrives in.
 *
 * The read hands the whole comparison over twice — flat at the top level and
 * again under `session` — while the POST and PATCH answers hand it over only
 * under `session`. Both are the same report, so the page picks each field out
 * of whichever copy has it, once, and everything below reads one shape. An
 * empty `id` means there is no open reconciliation, which is the answer the
 * read gives when no session is open.
 */
function reportOf(payload) {
  // The report arrives flat on a GET and under `session` on a POST or a PATCH.
  // Whichever it is, ONE object is read from - reading half of each is how a
  // session that had just been given three lines showed an empty book column.
  const inner = payload && typeof payload.session === 'object' && payload.session !== null ? payload.session : null;
  const report = inner || payload || {};
  const pick = (value, fallback) => (value !== undefined && value !== null ? value : fallback);

  return {
    id: pick(report.id, ''),
    account: pick(report.account, null),
    accountCode: pick(report.accountCode, report.account?.code || ''),
    accounts: report.accounts || payload?.accounts || [],
    group: report.group || payload?.group || null,
    ledger: report.ledger || { balance: 0, items: [] },
    statement: {
      date: pick(report.statement?.date, pick(report.statementDate, '')),
      balance: pick(report.statement?.balance, pick(report.statementBalance, 0)),
      lines: report.statement?.lines || report.lines || [],
    },
    totals: report.totals || null,
    counts: report.counts || null,
    status: pick(report.status, 'draft'),
    note: pick(report.note, ''),
    closeable: report.closeable === true,
    reason: report.reason || '',
  };
}

export default function GroupReconcilePage() {
  const { t, ledgerCurrency } = useLocale();
  const { push } = useToast();
  const params = useParams();
  // Mounted as /groups/:groupId/reconcile; `params.id` read as well so the
  // screen works whichever name the mount path used.
  const groupId = params.groupId || params.id;

  const [data, setData] = useState(null);
  const [can, setCan] = useState({});
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState('');

  const [draft, setDraft] = useState({ ...BLANK });
  const [paste, setPaste] = useState('');
  const [skipped, setSkipped] = useState([]);
  const [trimmed, setTrimmed] = useState(false);
  const [one, setOne] = useState({ ...BLANK_LINE });
  const [startError, setStartError] = useState('');

  const [booking, setBooking] = useState(null);
  const [ignoring, setIgnoring] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  function load() {
    if (!groupId) return Promise.resolve();
    return Promise.all([
      api.get(`/api/groups/${groupId}/ledger/reconcile`),
      api.get(`/api/groups/${groupId}`),
    ])
      .then(([view, group]) => {
        setData({ ...reportOf(view), group: view.group || group.group || {}, accounts: view.accounts || [] });
        setCan(group.group?.viewer?.can || {});
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

  /* ------------------------------------------------------------- the writes -- */

  /** One PATCH, and the report it answers with becomes the page. */
  async function patch(url, body, toastKey) {
    setBusyKey(url);
    setAlert('');
    try {
      const res = await api.patch(url, body);
      const report = res.session || res;
      setData((prev) =>
        prev
          ? {
              ...prev,
              ...reportOf(res),
              // the group and the chart do not change on a write, so they are
              // kept unless the answer happens to carry them
              group: report.group || prev.group,
              accounts: report.accounts?.length ? report.accounts : prev.accounts,
            }
          : prev
      );
      if (toastKey) push(t(toastKey));
      return true;
    } catch (err) {
      // The server's sentence, as it stands. A 409 from Finish says exactly what
      // is still open, and rewriting it here would only make it vaguer.
      setAlert(err.message);
      if (err.status !== 409) push(err.message, 'error');
      return false;
    } finally {
      setBusyKey('');
    }
  }

  /**
   * Finish. This one is a POST of its own, and the answer is not a page: once
   * the session is closed the read stops returning it, so the screen is read
   * again and the start form is what the reader is left holding.
   */
  function closeSession() {
    setSaving(true);
    setAlert('');
    api
      .post(`/api/groups/${groupId}/ledger/reconcile/${data.id}/close`)
      .then(() => {
        push(t('ledger.toast.closed'));
        return load();
      })
      .catch((err) => {
        // A 409 names exactly what is still open, in the server's own words.
        setAlert(err.message);
        if (err.status !== 409) push(err.message, 'error');
      })
      .finally(() => setSaving(false));
  }

  function startSession() {
    setStartError('');
    if (!draft.accountCode) {
      setStartError(t('ledger.recon.needAccount'));
      return;
    }
    if (!draft.statementDate) {
      setStartError(t('ledger.recon.needDate'));
      return;
    }
    if (!normaliseAmount(draft.statementBalance)) {
      setStartError(t('ledger.recon.needBalance'));
      return;
    }
    if (draft.lines.length === 0) {
      setStartError(t('ledger.recon.needLines'));
      return;
    }
    setSaving(true);
    api
      .post(`/api/groups/${groupId}/ledger/reconcile`, {
        accountCode: draft.accountCode,
        statementDate: draft.statementDate,
        statementBalance: normaliseAmount(draft.statementBalance),
        lines: draft.lines,
      })
      .then((res) => {
        const matched = Number(res.matched) || 0;
        push(matched > 0 ? t('ledger.recon.matched', { n: matched }) : t('ledger.toast.started'));
        setData({ ...reportOf(res), group: res.session?.group || data?.group || {}, accounts: res.session?.accounts || data?.accounts || [] });
        setDraft({ ...BLANK, statementDate: draft.statementDate });
        setPaste('');
        setSkipped([]);
        setTrimmed(false);
        setOne({ ...BLANK_LINE, date: draft.statementDate });
        setAlert('');
      })
      .catch((err) => setStartError(err.message))
      .finally(() => setSaving(false));
  }

  /** The pasted statement, read into the draft list. */
  function addPasted() {
    const { lines, bad } = parseStatement(paste);
    // Anything past the cap is dropped, and the reader is told so rather than
    // finding out weeks later that a line of the statement never arrived.
    const room = MAX_STATEMENT_LINES - draft.lines.length;
    setTrimmed(lines.length > room);
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, ...lines].slice(0, MAX_STATEMENT_LINES) }));
    setSkipped(bad);
    setPaste('');
  }

  function addOne(event) {
    event.preventDefault();
    const date = one.date.trim();
    const description = one.description.trim();
    const amount = normaliseAmount(one.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !amount || Number(amount) === 0) {
      setStartError(t('ledger.recon.oneNeed'));
      return;
    }
    setStartError('');
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, { date, description, amount }].slice(0, MAX_STATEMENT_LINES) }));
    setOne((prev) => ({ ...prev, description: '', amount: '' }));
  }

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
        title={t('ledger.recon.title')}
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
        title={t('ledger.recon.title')}
        actions={backLink}
      >
        <div className="card">
          <EmptyState
            icon="bank"
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
        title={t('ledger.recon.title')}
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
        <div className="skeleton" style={{ height: 120, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <p className="smallish muted mb-0 mt-3">{t('ledger.loading')}</p>
      </div>
    );
  }

  /* ---------------------------------------------------------- the screen -- */

  const currency = data.group?.currency || ledgerCurrency || '';
  const mayRun = Boolean(can.reconcile);
  const account = data.account || data.accounts.find((row) => row.code === data.accountCode) || null;

  return shell(
    <>
      <LedgerHead
        group={data.group}
        currency={currency}
        current="recon"
        titleKey="ledger.recon.title"
        noteKey="ledger.recon.subtitle"
      />

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('ledger.retry')}
          </button>
        </div>
      )}

      {!mayRun && (
        <p className="smallish muted">
          <Icon name="lock" size={14} /> {t('ledger.recon.readOnly')}
        </p>
      )}

      {!data.id ? (
        <StartReconciliation
          accounts={data.accounts}
          currency={currency}
          draft={draft}
          setDraft={setDraft}
          paste={paste}
          setPaste={setPaste}
          skipped={skipped}
          trimmed={trimmed}
          addPasted={addPasted}
          one={one}
          setOne={setOne}
          addOne={addOne}
          startError={startError}
          saving={saving}
          mayRun={mayRun}
          onStart={startSession}
        />
      ) : (
        <>
          <div className="card cc-ledger-session">
            <div className="cc-ledger-session-head">
              <div>
                <strong className="cc-ledger-session-account">
                  {account ? `${account.code} — ${account.name}` : data.accountCode}
                </strong>
                <span className="smallish muted cc-ledger-session-when">
                  {t('ledger.recon.statementDate')}: {dayLabel(data.statement.date)} ·{' '}
                  {t('ledger.recon.statementBalance')}:{' '}
                  <strong className="num">{ledgerAmount(data.statement.balance, currency)}</strong>
                </span>
              </div>
              <span className={`pill ${data.status === 'reconciled' ? 'pill-income' : 'pill-suggest'}`}>
                <Icon name={data.status === 'reconciled' ? 'checkCircle' : 'clock'} size={13} />
                {data.status === 'reconciled' ? t('ledger.recon.closedStatus') : t('ledger.recon.draftStatus')}
              </span>
            </div>
            {data.note && <p className="smallish muted mb-0">{data.note}</p>}
            {data.status === 'reconciled' && <p className="smallish mb-0">{t('ledger.recon.closedOn')}</p>}
          </div>

          <DifferencePanel
            totals={data.totals}
            counts={data.counts}
            currency={currency}
            closeable={data.closeable}
            reason={data.reason}
            can={mayRun}
            busy={saving}
            alert={alert}
            onClose={closeSession}
          />

          <div className="cc-ledger-split">
            <section className="card cc-ledger-col" aria-label={t('ledger.recon.statementCaption')}>
              <div className="card-title">
                <span>{t('ledger.recon.statementCol')}</span>
                <span className="smallish muted num">{data.statement.lines.length}</span>
              </div>
              {data.statement.lines.length === 0 ? (
                <p className="muted mb-0">{t('ledger.recon.noStatementLines')}</p>
              ) : (
                <ul className="cc-ledger-rows">
                  {data.statement.lines.map((line) => (
                    <StatementRow
                      key={line.key}
                      line={line}
                      currency={currency}
                      can={mayRun}
                      busy={busyKey.includes(`/lines/${line.key}`)}
                      journalTo={groupId ? `/groups/${groupId}/journal` : null}
                      onBook={(row) => {
                        setAlert('');
                        setBooking(row);
                      }}
                      onIgnore={(row) => {
                        setAlert('');
                        setIgnoring(row);
                      }}
                      onOpen={(row) =>
                        patch(`/api/groups/${groupId}/ledger/reconcile/${data.id}/lines/${row.key}`, { as: 'open' }, 'ledger.toast.decided')
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="card cc-ledger-col" aria-label={t('ledger.recon.booksCaption')}>
              <div className="card-title">
                <span>{t('ledger.recon.booksCol')}</span>
                <span className="smallish muted num">{ledgerAmount(data.ledger.balance, currency)}</span>
              </div>
              {data.ledger.items.length === 0 ? (
                <p className="muted mb-0">{t('ledger.recon.noBookLines')}</p>
              ) : (
                <ul className="cc-ledger-rows">
                  {data.ledger.items.map((item) => (
                    <BookRow
                      key={item.lineId}
                      item={item}
                      currency={currency}
                      can={mayRun}
                      busy={busyKey.endsWith(`/book/${item.lineId}`)}
                      onTransit={() =>
                        patch(
                          `/api/groups/${groupId}/ledger/reconcile/${data.id}/book/${item.lineId}`,
                          { outstanding: !item.outstanding },
                          'ledger.toast.transit'
                        )
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {booking && (
        <BookLineModal
          line={booking}
          accountLabel={account?.name ? `${account.code} ${account.name}` : data.accountCode}
          accounts={data.accounts}
          currency={currency}
          saving={busyKey.includes(`/lines/${booking.key}`)}
          error={alert}
          onClose={() => {
            setBooking(null);
            setAlert('');
          }}
          onSubmit={(body) =>
            patch(
              `/api/groups/${groupId}/ledger/reconcile/${data.id}/lines/${booking.key}`,
              { as: 'book', ...body },
              'ledger.toast.decided'
            ).then((ok) => {
              if (ok) setBooking(null);
            })
          }
        />
      )}

      {ignoring && (
        <IgnoreModal
          line={ignoring}
          currency={currency}
          saving={busyKey.includes(`/lines/${ignoring.key}`)}
          error={alert}
          onClose={() => {
            setIgnoring(null);
            setAlert('');
          }}
          onSubmit={(reason) =>
            patch(
              `/api/groups/${groupId}/ledger/reconcile/${data.id}/lines/${ignoring.key}`,
              { as: 'ignore', reason },
              'ledger.toast.decided'
            ).then((ok) => {
              if (ok) setIgnoring(null);
            })
          }
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------- the start form -- */

/**
 * The form that opens a reconciliation. The paste box is first and is the way
 * most statements arrive; the single-line form sits beside it for the one line
 * that was left out. The list underneath is what will actually be sent, so a
 * reader can see exactly what was read out of the paste before it is sent.
 */
function StartReconciliation({
  accounts,
  currency,
  draft,
  setDraft,
  paste,
  setPaste,
  skipped,
  trimmed,
  addPasted,
  one,
  setOne,
  addOne,
  startError,
  saving,
  mayRun,
  onStart,
}) {
  const { t } = useLocale();
  const assets = useMemo(() => (accounts || []).filter((row) => row.type === 'asset'), [accounts]);

  // The total of the lines typed so far, and how far it sits from the closing
  // balance. Both are the reader's own figures, added up where they can see it,
  // because a mistyped statement is otherwise invisible until it is a mystery
  // three weeks later. A gap is NOT an error: a closing balance is what is left
  // after everything the statement covers, so the sentence under it says so.
  const typed = draft.lines.reduce((sum, line) => sum + Math.round(Number(line.amount || 0) * 100), 0);
  const closing = Math.round(Number(normaliseAmount(draft.statementBalance) || 0) * 100);
  const gap = closing - typed;

  const ready = draft.accountCode && draft.statementDate && normaliseAmount(draft.statementBalance) && draft.lines.length > 0;
  const blocked = !ready
    ? !draft.accountCode
      ? t('ledger.recon.needAccount')
      : !draft.statementDate
        ? t('ledger.recon.needDate')
        : !normaliseAmount(draft.statementBalance)
          ? t('ledger.recon.needBalance')
          : t('ledger.recon.needLines')
    : '';

  if (!mayRun) {
    return (
      <div className="card">
        <EmptyState icon="bank" title={t('ledger.recon.noSessionTitle')}>
          {t('ledger.recon.noSessionBody')}
        </EmptyState>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="card">
        <EmptyState icon="bank" title={t('ledger.recon.noSessionTitle')}>
          {t('ledger.recon.noAssets')}
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-title">
          <span>{t('ledger.recon.startTitle')}</span>
        </div>
        <p className="smallish muted">{t('ledger.recon.startIntro')}</p>

        {startError && (
          <div className="field-error mb-3" role="alert">
            <Icon name="warning" size={16} />
            <span>{startError}</span>
          </div>
        )}

        <div className="row g-2">
          <div className="col-12 col-sm-6">
            <FormField label={t('ledger.recon.account')} htmlFor="recon-account">
              {(a) => (
                <select
                  id="recon-account"
                  className="input"
                  value={draft.accountCode}
                  onChange={(e) => setDraft((prev) => ({ ...prev, accountCode: e.target.value }))}
                  {...a}
                >
                  <option value="">{t('ledger.journal.pickAccount')}</option>
                  {assets.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.code} &mdash; {row.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
          <div className="col-12 col-sm-3">
            <FormField label={t('ledger.recon.statementDate')} htmlFor="recon-date">
              {(a) => (
                <input
                  id="recon-date"
                  className="input"
                  type="date"
                  value={draft.statementDate}
                  onChange={(e) => setDraft((prev) => ({ ...prev, statementDate: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div className="col-12 col-sm-3">
            <FormField label={t('ledger.recon.statementBalance')} htmlFor="recon-balance">
              {(a) => (
                <input
                  id="recon-balance"
                  className="input num"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={draft.statementBalance}
                  onChange={(e) => setDraft((prev) => ({ ...prev, statementBalance: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </div>
        </div>

        <div className="cc-ledger-split">
          <div className="cc-ledger-paste">
            <FormField label={t('ledger.recon.pasteLabel')} htmlFor="recon-paste" help={t('ledger.recon.pasteHelp')}>
              {(a) => (
                <textarea
                  id="recon-paste"
                  className="input cc-ledger-paste-box"
                  rows={7}
                  spellCheck={false}
                  placeholder={t('ledger.recon.pastePlaceholder')}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  {...a}
                />
              )}
            </FormField>
            {(skipped.length > 0 || trimmed) && (
              <div className="cc-ledger-skipped" role="alert">
                {skipped.map((row) => (
                  <p className="field-error mb-0" key={row.n}>
                    <Icon name="warning" size={16} />
                    <span>{t('ledger.recon.pasteBad', { n: row.n })}</span>
                  </p>
                ))}
                {trimmed && (
                  <p className="field-error mb-0">
                    <Icon name="warning" size={16} />
                    <span>{t('ledger.recon.pasteTooMany', { n: MAX_STATEMENT_LINES })}</span>
                  </p>
                )}
              </div>
            )}
            <button type="button" className="btn btn-secondary" onClick={addPasted} disabled={!paste.trim()}>
              <Icon name="plus" size={16} /> {t('ledger.recon.pasteAdd')}
            </button>
          </div>

          <form onSubmit={addOne} noValidate>
            <p className="smallish muted mb-2">
              <strong>{t('ledger.recon.oneTitle')}</strong>
            </p>
            <FormField label={t('ledger.recon.oneDate')} htmlFor="recon-one-date">
              {(a) => (
                <input
                  id="recon-one-date"
                  className="input"
                  type="date"
                  value={one.date}
                  onChange={(e) => setOne((prev) => ({ ...prev, date: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
            <FormField label={t('ledger.recon.oneDescription')} htmlFor="recon-one-what">
              {(a) => (
                <input
                  id="recon-one-what"
                  className="input"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  value={one.description}
                  onChange={(e) => setOne((prev) => ({ ...prev, description: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
            <FormField label={t('ledger.recon.oneAmount')} htmlFor="recon-one-amount">
              {(a) => (
                <input
                  id="recon-one-amount"
                  className="input num"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="-450.00"
                  value={one.amount}
                  onChange={(e) => setOne((prev) => ({ ...prev, amount: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
            <button type="submit" className="btn btn-secondary">
              <Icon name="plus" size={16} /> {t('ledger.recon.oneAdd')}
            </button>
          </form>
        </div>
      </div>

      <div className="card cc-ledger-draft">
        <div className="card-title">
          <span>{t('ledger.recon.draftTitle')}</span>
          <span className="smallish muted num">{t('ledger.recon.draftCount', { n: draft.lines.length })}</span>
        </div>

        {draft.lines.length === 0 ? (
          <p className="muted mb-0">{t('ledger.recon.draftEmpty')}</p>
        ) : (
          <>
            <ul className="cc-ledger-rows">
              {draft.lines.map((line, at) => (
                <li className="cc-ledger-row" key={`draft-${at}`}>
                  <div className="cc-ledger-row-main">
                    <span className="cc-ledger-row-date smallish muted num">{dayLabel(line.date)}</span>
                    <span className="cc-ledger-name">{line.description}</span>
                    <MoneyCell value={Number(line.amount)} currency={currency} tone={Number(line.amount) < 0 ? 'out' : 'in'} />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== at) }))}
                    aria-label={t('ledger.removeLine', { n: at + 1 })}
                    title={t('ledger.removeLine', { n: at + 1 })}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>

            <p className="smallish cc-ledger-draft-total">
              {t('ledger.recon.draftTotal', { n: draft.lines.length, total: ledgerAmount(typed / 100, currency) })}
            </p>
            {gap !== 0 && <p className="smallish muted mb-0">{t('ledger.recon.draftGap', { amount: ledgerAmount(Math.abs(gap) / 100, currency) })}</p>}
          </>
        )}

        <div className="mt-3">
          <button type="button" className="btn btn-primary" onClick={onStart} disabled={saving || !ready}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.recon.start')}
          </button>
          {blocked && (
            <p className="smallish muted mb-0">
              <Icon name="info" size={14} /> {blocked}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- the book rows -- */

/**
 * One line in the books, for the account being reconciled: the entry it came
 * from, what it did to the balance, and what has been decided about it. A line
 * the server paired with a statement line says which one; a line nobody has
 * decided about yet can be marked as still in transit, which moves the count
 * and never the money.
 */
function BookRow({ item, currency, can, busy, onTransit }) {
  const { t } = useLocale();
  const amount = Number(item.amount) || 0;

  return (
    <li className="cc-ledger-row" aria-busy={busy}>
      <div className="cc-ledger-row-main">
        <span className="cc-ledger-row-date smallish muted num">
          <span className="cc-ledger-ref">{item.ref}</span> · {dayLabel(item.date)}
        </span>
        <span className="cc-ledger-name">{item.memo || NONE}</span>
        <MoneyCell value={amount} currency={currency} tone={amount < 0 ? 'out' : 'in'} />
      </div>

      <div className="cc-ledger-row-state">
        {item.matchedBy ? (
          <span className="pill cc-ledger-state">
            <Icon name="check" size={13} /> {t('ledger.recon.asMatched')}
            <span className="cc-ledger-state-note">{t('ledger.recon.matchedWith', { key: item.matchedBy })}</span>
          </span>
        ) : (
          <span className={`pill cc-ledger-state ${item.outstanding ? 'pill-suggest' : ''}`}>
            <Icon name={item.outstanding ? 'clock' : 'help'} size={13} />
            {item.outstanding ? t('ledger.recon.inTransit') : t('ledger.recon.asOpen')}
          </span>
        )}
      </div>

      {can && !item.matchedBy && (
        <div className="cc-ledger-acts">
          <button
            type="button"
            className="btn btn-secondary cc-ledger-transit"
            aria-pressed={Boolean(item.outstanding)}
            disabled={busy}
            onClick={onTransit}
            title={t('ledger.recon.inTransitHelp')}
          >
            <Icon name="clock" size={15} /> {t('ledger.recon.inTransit')}
          </button>
        </div>
      )}
    </li>
  );
}

/* the em dash a column shows when a line carried no words is NONE, at the top */
/* -------------------------------------------------------------- the dialogs -- */

/**
 * Recording the missing entry. This is the one place on this screen that writes
 * to the books, so what it is about is spelled out before the button: a real,
 * immutable journal entry, dated the day the statement gives, on the other side
 * of the account being reconciled.
 */
function BookLineModal({ line, accountLabel, accounts, currency, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const amount = Number(line.amount) || 0;
  const moneyIn = amount > 0;
  const wanted = moneyIn ? 'income' : 'expense';
  const [memo, setMemo] = useState('');
  const [code, setCode] = useState('');
  const options = (accounts || []).filter((row) => row.type === wanted);

  return (
    <Modal
      title={t('ledger.recon.bookTitle', { key: line.key })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => onSubmit({ memo: memo.trim(), ...(code ? { expenseCode: code } : {}) })}
          >
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.postEntry')}
          </button>
        </>
      }
    >
      <p className="smallish mb-3">{t('ledger.recon.bookNote', { account: accountLabel, date: dayLabel(line.date) })}</p>

      <div className="cc-ledger-book-head">
        <span className="smallish muted num">{dayLabel(line.date)}</span>
        <span>{line.description || NONE}</span>
        <MoneyCell value={amount} currency={currency} tone={moneyIn ? 'in' : 'out'} />
      </div>

      {error && (
        <div className="field-error mt-3" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <FormField label={t('ledger.recon.bookMemo')} htmlFor="recon-book-memo" help={t('ledger.recon.bookMemoHelp')}>
        {(a) => (
          <input
            id="recon-book-memo"
            className="input"
            type="text"
            maxLength={200}
            autoComplete="off"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            {...a}
          />
        )}
      </FormField>

      <FormField label={t('ledger.recon.bookOther')} htmlFor="recon-book-other" help={t('ledger.recon.bookOtherHelp')}>
        {(a) => (
          <select id="recon-book-other" className="input" value={code} onChange={(e) => setCode(e.target.value)} {...a}>
            <option value="">{t('ledger.recon.bookDefault')}</option>
            {options.map((row) => (
              <option key={row.code} value={row.code}>
                {row.code} &mdash; {row.name}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <p className="smallish muted mb-0">
        <Icon name="info" size={14} /> {t(typeKey(wanted))}
      </p>
    </Modal>
  );
}

/** Ignoring a line, which needs a reason, because "not ours" is a claim. */
function IgnoreModal({ line, currency, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [bad, setBad] = useState('');

  function go() {
    if (!reason.trim()) {
      setBad(t('ledger.recon.ignoreNeed'));
      return;
    }
    setBad('');
    onSubmit(reason.trim());
  }

  return (
    <Modal
      title={t('ledger.recon.ignoreTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={go} disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.recon.ignoreGo')}
          </button>
        </>
      }
    >
      <div className="cc-ledger-book-head">
        <span className="smallish muted num">{dayLabel(line.date)}</span>
        <span>{line.description || NONE}</span>
        <MoneyCell value={Number(line.amount)} currency={currency} tone={Number(line.amount) < 0 ? 'out' : 'in'} />
      </div>

      {(bad || error) && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" size={16} />
          <span>{bad || error}</span>
        </div>
      )}

      <FormField label={t('ledger.recon.ignoreReason')} htmlFor="recon-ignore-reason" error={bad || undefined}>
        {(a) => (
          <textarea
            id="recon-ignore-reason"
            className="input"
            rows={3}
            maxLength={200}
            placeholder={t('ledger.recon.ignorePlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            {...a}
          />
        )}
      </FormField>
    </Modal>
  );
}

/* ------------------------------------------------------------ the statement -- */

/**
 * One pasted block of statement, read into lines.
 *
 * A quoted description may contain the separator, so the quotes are honoured
 * before anything is split, and a line is only kept when all three parts are
 * there and the amount is a number with at most two decimals. A row that is not
 * is reported by its number rather than dropped silently: a statement line
 * quietly missing is exactly the mistake this screen exists to prevent.
 *
 * The date is the one thing that is NOT guessed. A statement can carry a date in
 * a dozen shapes, and reading "03/04/2026" as a day or a month wrongly would
 * put the entry in the wrong month — so the format asked for is the one the
 * server stores, and a row in another shape is named and left out.
 */
function parseStatement(text) {
  const lines = [];
  const bad = [];
  String(text || '')
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .forEach((row, at) => {
      const cells = splitRow(row);
      if (cells.length < 3) {
        bad.push({ n: at + 1, row });
        return;
      }
      const date = cells[0];
      const description = cells.slice(1, -1).join(',').trim();
      const amount = normaliseAmount(cells[cells.length - 1]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !amount || Number(amount) === 0) {
        bad.push({ n: at + 1, row });
        return;
      }
      lines.push({ date, description, amount });
    });
  return { lines, bad };
}

/** Three columns out of one line, whatever separator the bank used. */
function splitRow(row) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (quoted) {
      if (ch !== '"') current += ch;
      else if (row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * A statement amount, as the server reads it: a plain signed number with at most
 * two decimals. A bank file in a language that writes 1.234,56 is understood
 * here rather than refused — the last separator is the decimal point, and a
 * group of three digits is a thousands separator — because a treasurer pasting
 * their own statement should not have to know which of the app's fourteen
 * languages the bank exported in. Returns '' when the text is not an amount at
 * all, which is the signal to name the row and leave it out.
 */
function normaliseAmount(text) {
  let s = String(text ?? '').trim().replace(/[\s\u00a0']/g, '');
  if (!s) return '';
  // (450.00) is how a bank prints money out.
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  s = s.replace(/^\+/, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1) {
    s = s.length - lastDot === 4 ? s.replace(/\./g, '') : s; // 1.234 is a thousands group
  }
  return /^-?\d+(\.\d{1,2})?$/.test(s) ? s : '';
}
