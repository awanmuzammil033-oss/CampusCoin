import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useLocale } from '../locale.jsx';
import { EntryCard, LedgerHead, ledgerAmount, typeKey } from '../components/GroupLedger.jsx';

/**
 * The group's general journal (GRP-3): every entry the group has posted, newest
 * first, each one double-entry — the two columns the same number, or the entry
 * was never stored.
 *
 * A posted entry is immutable, so this screen is not a ledger anybody edits. It
 * is a record you can read, question and correct, and the correction is always
 * a second, mirrored entry rather than a change to the first. That is why the
 * only write controls here are "post the reverse" and "ask about this": a book
 * that can be quietly tidied is a book nobody can trust a month later.
 *
 * The new-entry form does sum what has been typed, and that is the one sum in
 * this screen that is not the server's: it is the author's own keystrokes being
 * checked before they are sent, in whole cents, so Save can stay off until the
 * two columns agree. The server still decides, and its sentence goes on screen
 * as-is when it says no.
 */

const PAGE = 25;
const MAX_LINES = 20; // the server's own cap, so the form cannot offer more
const MIN_LINES = 2;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole cents out of a typed amount, for the form's own running total. */
function centsOf(text) {
  const n = Number(String(text ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function GroupJournalPage() {
  const { t, ledgerCurrency } = useLocale();
  const { push } = useToast();
  const params = useParams();
  // Mounted as /groups/:groupId/journal. Reading `params.id` as well keeps the
  // screen working if the route is written the other way round.
  const groupId = params.groupId || params.id;

  const [data, setData] = useState(null); // { group, accounts, rows, nextCursor }
  const [can, setCan] = useState({}); // what this person may do, straight from the server
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  const [composing, setComposing] = useState(false);
  const [reversing, setReversing] = useState(null);
  const [flagging, setFlagging] = useState(null);
  const [clearing, setClearing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState('');

  /**
   * The page and the permissions are read together, because a control is only
   * drawn when the server says this person may use it, and a page that loaded
   * without knowing that would have to guess.
   */
  function load() {
    if (!groupId) return Promise.resolve();
    return Promise.all([
      api.get(`/api/groups/${groupId}/ledger/journal${qs({ limit: PAGE })}`),
      api.get(`/api/groups/${groupId}`),
    ])
      .then(([journal, group]) => {
        setData({
          group: journal.group || group.group || {},
          accounts: journal.accounts || [],
          rows: journal.rows || [],
          nextCursor: journal.nextCursor || null,
        });
        setCan(group.group?.viewer?.can || {});
        setError('');
        setGone(false);
      })
      .catch((err) => {
        // 404 or 403 is the server's way of saying "you are not in this group,
        // or it is gone" — a different answer from "try again in a moment", and
        // one the screen explains in full below, so it is not repeated as a
        // toast on top of that.
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

  /** Older entries. The cursor is the server's, so a page is never guessed at. */
  function loadMore() {
    if (!data?.nextCursor || moreBusy) return;
    setMoreBusy(true);
    api
      .get(`/api/groups/${groupId}/ledger/journal${qs({ limit: PAGE, before: data.nextCursor })}`)
      .then((page) => {
        setData((prev) =>
          prev ? { ...prev, rows: [...prev.rows, ...(page.rows || [])], nextCursor: page.nextCursor || null } : prev
        );
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setMoreBusy(false));
  }

  /**
   * After a write the page is read again from the top rather than patched in
   * place: an entry's date decides where it sorts, and a date the reader chose
   * by hand would put a patched-in row in the wrong place. A fresh read is also
   * the only way the reference, the totals and the flag come back as the server
   * wrote them.
   */
  async function write(promise, toastKey) {
    setSaving(true);
    setWriteError('');
    try {
      await promise;
      push(t(toastKey));
      setComposing(false);
      setReversing(null);
      setFlagging(null);
      setClearing(null);
      await load();
    } catch (err) {
      setWriteError(err.message);
    } finally {
      setSaving(false);
    }
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
        title={t('ledger.journal.title')}
        actions={
          <>
            {backLink}
            {can.postJournal && (
              <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
                <Icon name="plus" size={16} /> {t('ledger.journal.newEntry')}
              </button>
            )}
          </>
        }
      >
        {body}
      </Page>
    );
  }

  // Not a member, or the group is gone: say so in words and offer the way back,
  // rather than an empty journal that looks like a group that never had money.
  if (gone || !groupId) {
    return (
      <Page
        trail={[{ label: t('groups.title'), to: '/groups' }, { label: t('groups.notFound') }]}
        title={t('ledger.journal.title')}
        actions={backLink}
      >
        <div className="card">
          <EmptyState
            icon="book"
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
        title={t('ledger.journal.title')}
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
        <div className="skeleton" style={{ height: 48, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 48, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 48 }} />
        <p className="smallish muted mb-0 mt-3">{t('ledger.loading')}</p>
      </div>
    );
  }

  /* ---------------------------------------------------------- the screen -- */

  const rows = data.rows;
  const currency = data.group?.currency || ledgerCurrency || '';

  return shell(
    <>
      <LedgerHead
        group={data.group}
        currency={currency}
        current="journal"
        titleKey="ledger.journal.title"
        noteKey="ledger.journal.subtitle"
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

      {!can.postJournal && (
        <p className="smallish muted">
          <Icon name="lock" size={14} /> {t('ledger.journal.readOnly')}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="book"
            title={t('ledger.journal.emptyTitle')}
            action={
              can.postJournal ? (
                <button type="button" className="btn btn-primary mt-2" onClick={() => setComposing(true)}>
                  <Icon name="plus" size={16} /> {t('ledger.journal.newEntry')}
                </button>
              ) : null
            }
          >
            {t('ledger.journal.emptyBody')}
          </EmptyState>
        </div>
      ) : (
        <div className="cc-ledger">
          {rows.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              currency={currency}
              can={can}
              busy={saving}
              reconcileTo={groupId ? `/groups/${groupId}/reconcile` : null}
              onReverse={(row) => {
                setWriteError('');
                setReversing(row);
              }}
              onFlag={(row) => {
                setWriteError('');
                setFlagging(row);
              }}
              onClearFlag={(row) => {
                setWriteError('');
                setClearing(row);
              }}
            />
          ))}
        </div>
      )}

      {data.nextCursor && (
        <div className="text-center mt-3">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={moreBusy}>
            {moreBusy && <span className="spinner" aria-hidden="true" />}
            {t('ledger.journal.more')}
          </button>
        </div>
      )}

      {composing && (
        <EntryForm
          accounts={data.accounts}
          currency={currency}
          saving={saving}
          error={writeError}
          onClose={() => {
            setComposing(false);
            setWriteError('');
          }}
          onSubmit={(values) =>
            // No `ref` is ever sent: the server assigns it, so two people posting
            // at the same moment cannot collide on one.
            write(
              api.post(`/api/groups/${groupId}/ledger/journal`, {
                date: values.date,
                memo: values.memo,
                lines: values.lines,
              }),
              'ledger.toast.posted'
            )
          }
        />
      )}

      {reversing && (
        <ReverseModal
          entry={reversing}
          saving={saving}
          error={writeError}
          onClose={() => {
            setReversing(null);
            setWriteError('');
          }}
          onSubmit={(date) =>
            write(
              api.post(`/api/groups/${groupId}/ledger/journal/${reversing.id}/reverse`, { date }),
              'ledger.toast.reversed'
            )
          }
        />
      )}

      {flagging && (
        <FlagModal
          entry={flagging}
          saving={saving}
          error={writeError}
          onClose={() => {
            setFlagging(null);
            setWriteError('');
          }}
          onSubmit={(reason) =>
            write(api.post(`/api/groups/${groupId}/ledger/journal/${flagging.id}/flag`, { reason }), 'ledger.toast.flagged')
          }
        />
      )}

      {clearing && (
        <ClearFlagModal
          entry={clearing}
          saving={saving}
          error={writeError}
          onClose={() => {
            setClearing(null);
            setWriteError('');
          }}
          onSubmit={(note) =>
            write(
              api.post(`/api/groups/${groupId}/ledger/journal/${clearing.id}/flag/clear`, { note }),
              'ledger.toast.flagCleared'
            )
          }
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- the form -- */

const BLANK_LINE = { code: '', debit: '', credit: '' };

/** The five account types, in the order somebody meets them. */
const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

/**
 * New entry, in a Modal because it asks for a date, a memo and a set of lines,
 * and because the two things it has to get right — every line on one side, and
 * the two columns equal — deserve the whole screen.
 *
 * The running total under the lines is the form's own arithmetic on what has
 * been typed, in whole cents. It is a check on the keystrokes, not a figure out
 * of the books, which is why Save can be switched off by it and why the server
 * still has the last word.
 */
function EntryForm({ accounts, currency, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const [form, setForm] = useState({ date: todayISO(), memo: '' });
  const [rows, setRows] = useState([{ ...BLANK_LINE }, { ...BLANK_LINE }]);
  const [bad, setBad] = useState('');

  const set = (field, value) => setForm((row) => ({ ...row, [field]: value }));
  const setLine = (at, field, value) => setRows((list) => list.map((row, i) => (i === at ? { ...row, [field]: value } : row)));

  const { debits, credits, gap } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const row of rows) {
      d += centsOf(row.debit);
      c += centsOf(row.credit);
    }
    return { debits: d, credits: c, gap: d - c };
  }, [rows]);

  const atCap = rows.length >= MAX_LINES;

  // The first thing that is wrong, in the order somebody fixes it. Save stays
  // off while any of these stands, and the sentence under the form says which.
  const problem = (() => {
    if (rows.length < MIN_LINES) return t('ledger.journal.needLines');
    const noAccount = rows.findIndex((row) => !row.code);
    if (noAccount >= 0) return t('ledger.journal.needAccount', { n: noAccount + 1 });
    const empty = rows.findIndex((row) => !centsOf(row.debit) && !centsOf(row.credit));
    if (empty >= 0) return t('ledger.journal.needAmount', { n: empty + 1 });
    const both = rows.findIndex((row) => centsOf(row.debit) > 0 && centsOf(row.credit) > 0);
    if (both >= 0) return t('ledger.journal.oneSide', { n: both + 1 });
    if (gap !== 0) return t('ledger.journal.saveBlocked');
    if (!form.date) return t('ledger.journal.needDate');
    if (!form.memo.trim()) return t('ledger.journal.needMemo');
    return '';
  })();

  function submit(event) {
    event.preventDefault();
    if (problem) {
      setBad(problem);
      return;
    }
    setBad('');
    onSubmit({
      date: form.date,
      memo: form.memo.trim(),
      lines: rows.map((row) => ({ code: row.code, debit: row.debit.trim(), credit: row.credit.trim() })),
    });
  }

  return (
    <Modal
      title={t('ledger.journal.formTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="submit" form="group-journal-form" className="btn btn-primary" disabled={saving || Boolean(problem)}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.postEntry')}
          </button>
        </>
      }
    >
      <form id="group-journal-form" onSubmit={submit} noValidate>
        <p className="smallish muted">{t('ledger.journal.formIntro')}</p>

        {(bad || error) && (
          <div className="field-error mb-3" role="alert">
            <Icon name="warning" size={16} />
            <span>{bad || error}</span>
          </div>
        )}

        <div className="row g-2">
          <div className="col-12 col-sm-7">
            <FormField label={t('ledger.journal.memo')} htmlFor="journal-memo">
              {(a) => (
                <input
                  id="journal-memo"
                  className="input"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  placeholder={t('ledger.journal.memoPlaceholder')}
                  value={form.memo}
                  onChange={(e) => set('memo', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div className="col-12 col-sm-5">
            <FormField label={t('ui.date')} htmlFor="journal-date" help={t('ledger.journal.inCurrency', { currency })}>
              {(a) => (
                <input
                  id="journal-date"
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
        </div>

        <fieldset className="cc-ledger-lines-form">
          <legend className="cc-ledger-lines-legend">{t('ledger.journal.formTitle')}</legend>

          {rows.map((row, at) => (
            <div className="cc-ledger-line-row" key={`line-${at}`}>
              <div className="cc-ledger-line-account">
                <FormField label={t('ledger.journal.accountFor', { n: at + 1 })} htmlFor={`journal-code-${at}`}>
                  {(a) => (
                    <select
                      id={`journal-code-${at}`}
                      className="input"
                      value={row.code}
                      onChange={(e) => setLine(at, 'code', e.target.value)}
                      {...a}
                    >
                      <option value="">{t('ledger.journal.pickAccount')}</option>
                      {TYPES.map((type) => {
                        const of = (accounts || []).filter((account) => account.type === type);
                        if (!of.length) return null;
                        return (
                          <optgroup key={type} label={t(typeKey(type))}>
                            {of.map((account) => (
                              <option key={account.code} value={account.code}>
                                {account.code} &mdash; {account.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  )}
                </FormField>
              </div>

              <div className="cc-ledger-line-amount">
                <FormField label={t('ledger.journal.debitFor', { n: at + 1 })} htmlFor={`journal-debit-${at}`}>
                  {(a) => (
                    <input
                      id={`journal-debit-${at}`}
                      className="input num"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={row.debit}
                      onChange={(e) => setLine(at, 'debit', e.target.value)}
                      {...a}
                    />
                  )}
                </FormField>
              </div>

              <div className="cc-ledger-line-amount">
                <FormField label={t('ledger.journal.creditFor', { n: at + 1 })} htmlFor={`journal-credit-${at}`}>
                  {(a) => (
                    <input
                      id={`journal-credit-${at}`}
                      className="input num"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={row.credit}
                      onChange={(e) => setLine(at, 'credit', e.target.value)}
                      {...a}
                    />
                  )}
                </FormField>
              </div>

              {rows.length > MIN_LINES && (
                <button
                  type="button"
                  className="icon-btn cc-ledger-line-drop"
                  onClick={() => setRows((list) => list.filter((_, i) => i !== at))}
                  aria-label={t('ledger.removeLine', { n: at + 1 })}
                  title={t('ledger.removeLine', { n: at + 1 })}
                >
                  <Icon name="trash" />
                </button>
              )}
            </div>
          ))}

          <div className="cc-ledger-running" role="status">
            <span className="smallish">
              {t('ledger.journal.running', {
                debits: ledgerAmount(debits / 100, currency),
                credits: ledgerAmount(credits / 100, currency),
              })}
            </span>
            <strong className={`cc-ledger-running-value${gap === 0 ? '' : ' cc-ledger-running-out'}`}>
              {gap === 0
                ? t('ledger.journal.savesWhenBalanced')
                : t('ledger.outBy', { amount: ledgerAmount(Math.abs(gap) / 100, currency) })}
            </strong>
          </div>

          {atCap ? (
            <p className="smallish muted mb-0">{t('ledger.journal.tooManyLines', { n: MAX_LINES })}</p>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setRows((list) => [...list, { ...BLANK_LINE }])}>
              <Icon name="plus" size={15} /> {t('ledger.journal.addLine')}
            </button>
          )}
        </fieldset>

        {problem && (
          <p className="smallish muted mb-0">
            <Icon name="info" size={14} /> {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------ the three dialogs -- */

/** The correction, said plainly: a second entry, and the first one untouched. */
function ReverseModal({ entry, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const [date, setDate] = useState(todayISO());

  return (
    <Modal
      title={t('ledger.journal.reverseTitle', { ref: entry.ref })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSubmit(date)} disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.journal.reverseGo')}
          </button>
        </>
      }
    >
      <p className="mb-0">{t('ledger.journal.reverseBody', { ref: entry.ref })}</p>
      {error && (
        <div className="field-error mt-3" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}
      <div className="mt-3">
        <FormField label={t('ledger.journal.reverseDate')} htmlFor="journal-reverse-date">
          {(a) => (
            <input
              id="journal-reverse-date"
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              {...a}
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}

/** A question on an entry, which changes nothing about the entry itself. */
function FlagModal({ entry, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [bad, setBad] = useState('');

  function go() {
    if (!reason.trim()) {
      setBad(t('ledger.journal.flagNeed'));
      return;
    }
    setBad('');
    onSubmit(reason.trim());
  }

  return (
    <Modal
      title={t('ledger.journal.flagTitle', { ref: entry.ref })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={go} disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.journal.flagGo')}
          </button>
        </>
      }
    >
      <p className="smallish muted">{t('ledger.journal.flagIntro')}</p>
      {(bad || error) && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" size={16} />
          <span>{bad || error}</span>
        </div>
      )}
      <FormField label={t('ledger.journal.flagReason')} htmlFor="journal-flag-reason" error={bad || undefined}>
        {(a) => (
          <textarea
            id="journal-flag-reason"
            className="input"
            rows={3}
            maxLength={200}
            placeholder={t('ledger.journal.flagPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            {...a}
          />
        )}
      </FormField>
    </Modal>
  );
}

/** The answer, kept on the entry under the question. */
function ClearFlagModal({ entry, saving, error, onClose, onSubmit }) {
  const { t } = useLocale();
  const [note, setNote] = useState('');

  return (
    <Modal
      title={t('ledger.journal.clearFlag')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSubmit(note.trim())} disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ledger.journal.clearFlag')}
          </button>
        </>
      }
    >
      <p className="smallish muted">{t('ledger.journal.clearIntro', { ref: entry.ref })}</p>
      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}
      <FormField label={t('ledger.journal.clearNote')} htmlFor="journal-clear-note">
        {(a) => (
          <input
            id="journal-clear-note"
            className="input"
            type="text"
            maxLength={200}
            autoComplete="off"
            placeholder={t('ledger.journal.clearPlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            {...a}
          />
        )}
      </FormField>
    </Modal>
  );
}
