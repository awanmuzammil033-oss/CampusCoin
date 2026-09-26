import { useEffect, useState } from 'react';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money, getLedgerCurrency } from '../money.js';
import { useLocale } from '../locale.jsx';
import { useAuth } from '../auth.jsx';
import { CURRENCIES } from '../data/currencies.js';
import { dayLabel } from '../dates.js';

/**
 * Shared groups (GRP-1..3) — hostel roommates, a rented flat, a project team.
 * One page in two states: the list of the student's groups, and one group
 * opened up (bills on the left of the story, the balance board on the right of
 * it). The maths is the server's job — this screen asks for a bill, previews
 * nothing it cannot be sure of, and then paints the board exactly as the API
 * returns it.
 *
 * Colours never carry the meaning on their own: "net owed" and "net owing"
 * always travel with a word and an arrow (design.md §5).
 */

const SPLIT_TYPES = ['equal', 'shares', 'exact'];
const SPLIT_LABEL = {
  equal: 'groups.splitEqual',
  shares: 'groups.splitShares',
  exact: 'groups.splitExact',
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BLANK_BILL = { title: '', amount: '', date: todayISO(), categoryId: '', paidByIndex: '0', note: '' };

/**
 * A group keeps its own currency, which is usually the student's ledger
 * currency — then money() is exactly right, display conversion included. A
 * group in some other currency must NOT be converted from the ledger, so it is
 * formatted in its own code rather than relabelled as if it were the same.
 */
function amount(value, currency) {
  const n = Number(value) || 0;
  if (currency === getLedgerCurrency()) return money(n);
  const sign = n < 0 ? '\u2212' : '';
  try {
    const text = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(n));
    return `${sign}${text}`;
  } catch {
    return `${sign}${currency} ${Math.abs(n).toFixed(2)}`;
  }
}

export default function GroupsPage() {
  const [openId, setOpenId] = useState(null);

  if (openId) return <GroupDetail groupId={openId} onBack={() => setOpenId(null)} />;
  return <GroupList onOpen={setOpenId} />;
}

/* --------------------------------- the list -------------------------------- */

function GroupList({ onOpen }) {
  const { t, plural, ledgerCurrency } = useLocale();
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  function load() {
    api
      .get('/api/groups')
      .then((data) => {
        setRows(data.rows || []);
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
  }, []);

  return (
    <Page
      trail={[{ label: t('groups.title') }]}
      title={t('groups.title')}
      subtitle={t('groups.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
          {t('groups.newGroup')}
        </button>
      }
    >
      <p className="smallish muted">
        <Icon name="info" /> {t('groups.howItWorks')}
      </p>

      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 64, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 64 }} />
          <p className="smallish muted mb-0 mt-3">{t('groups.loading')}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="users"
            title={t('groups.emptyTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={() => setShowNew(true)}>
                {t('groups.newGroup')}
              </button>
            }
          >
            {t('groups.emptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((group) => (
              <li key={group.id} className="txn-row flex-wrap">
                <span className="txn-ico">
                  <Icon name="users" />
                </span>
                <span className="txn-main">
                  <span className="txn-desc">{group.name}</span>
                  <span className="txn-meta">
                    {plural('groups.members', group.memberCount, { n: group.memberCount })} ·{' '}
                    {plural('groups.bills', group.expenseCount, { n: group.expenseCount })}
                    {group.lastActivity ? ` · ${t('groups.lastActivity', { date: dayLabel(group.lastActivity) })}` : ''}
                  </span>
                </span>
                <span className="num" style={{ whiteSpace: 'nowrap' }}>
                  {amount(group.billedTotal, group.currency)}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(group.id)}>
                  {t('groups.open')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNew && (
        <NewGroupModal
          defaultCurrency={ledgerCurrency || 'USD'}
          onClose={() => setShowNew(false)}
          onCreated={(group) => {
            setShowNew(false);
            push(t('groups.created', { name: group.name }));
            onOpen(group.id);
          }}
        />
      )}
    </Page>
  );
}

function NewGroupModal({ defaultCurrency, onClose, onCreated }) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [people, setPeople] = useState([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function setPerson(index, field, value) {
    setPeople((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function create(event) {
    event.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError(t('groups.needName'));
      return;
    }

    setSaving(true);
    try {
      const data = await api.post('/api/groups', {
        name: name.trim(),
        currency,
        members: people.map((person) => ({ name: person.name.trim(), email: person.email.trim() })),
      });
      onCreated(data.group);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={t('groups.newGroupTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <button type="submit" form="groups-new-form" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('ui.add')}
          </button>
        </>
      }
    >
      <form id="groups-new-form" onSubmit={create} noValidate>
        {formError && (
          <div className="field-error mb-3" role="alert">
            <Icon name="warning" />
            <span>{formError}</span>
          </div>
        )}

        <FormField label={t('groups.groupName')} htmlFor="group-name" help={t('groups.groupNameHelp')}>
          {(a) => (
            <input
              id="group-name"
              className="input"
              type="text"
              maxLength={60}
              autoComplete="off"
              placeholder={t('groups.groupNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              {...a}
            />
          )}
        </FormField>

        <FormField label={t('groups.currency')} htmlFor="group-currency" help={t('groups.currencyHelp')}>
          {(a) => (
            <select
              id="group-currency"
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              {...a}
            >
              {CURRENCIES.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '0.875rem', fontWeight: 600, padding: 0, marginBottom: 8 }}>
            {t('groups.membersTitle')}
          </legend>
          {people.length === 0 && <p className="smallish muted mb-2">{t('groups.noPeopleYet')}</p>}
          {people.map((person, index) => (
            <div className="d-flex gap-2 align-items-end mb-2" key={`mate-${index}`}>
              <div style={{ flex: '1 1 140px' }}>
                <FormField label={t('groups.personName')} htmlFor={`group-mate-name-${index}`}>
                  {(a) => (
                    <input
                      id={`group-mate-name-${index}`}
                      className="input"
                      type="text"
                      maxLength={80}
                      autoComplete="off"
                      value={person.name}
                      onChange={(e) => setPerson(index, 'name', e.target.value)}
                      {...a}
                    />
                  )}
                </FormField>
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <FormField label={t('groups.personEmail')} htmlFor={`group-mate-email-${index}`}>
                  {(a) => (
                    <input
                      id={`group-mate-email-${index}`}
                      className="input"
                      type="email"
                      autoComplete="off"
                      value={person.email}
                      onChange={(e) => setPerson(index, 'email', e.target.value)}
                      {...a}
                    />
                  )}
                </FormField>
              </div>
              <button
                type="button"
                className="icon-btn mb-3"
                onClick={() => setPeople((rows) => rows.filter((_, i) => i !== index))}
                aria-label={t('groups.removePersonAria', { name: person.name || t('groups.thisPerson') })}
                title={t('ui.remove')}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPeople((rows) => [...rows, { name: '', email: '' }])}
          >
            <Icon name="plus" size={15} /> {t('groups.addPerson')}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}

/* -------------------------------- the group ------------------------------- */

function GroupDetail({ groupId, onBack }) {
  const { t, plural } = useLocale();
  const { push } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);

  const [bill, setBill] = useState({ ...BLANK_BILL });
  const [splitType, setSplitType] = useState('equal');
  const [splitValues, setSplitValues] = useState({});
  const [billError, setBillError] = useState('');
  const [saving, setSaving] = useState(false);

  const [mate, setMate] = useState({ name: '', email: '' });
  const [mateError, setMateError] = useState('');

  const [settle, setSettle] = useState(null);
  const [settleError, setSettleError] = useState('');

  const [confirming, setConfirming] = useState(null); // 'archive' | 'delete'

  function load() {
    api
      .get(`/api/groups/${groupId}`)
      .then((detail) => {
        setData(detail);
        setError('');
      })
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load();
    let alive = true;
    api
      .get('/api/categories')
      .then((d) => alive && setCategories((d.expense || []).filter((c) => c.isActive !== false)))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const members = data?.members || [];
  const currency = data?.group?.currency || getLedgerCurrency();
  const myIndex = members.findIndex((member) => member.user && member.user === user?.id);

  function setBillField(field, value) {
    setBill((form) => ({ ...form, [field]: value }));
  }

  async function saveBill(event) {
    event.preventDefault();
    setBillError('');
    if (!bill.title.trim()) {
      setBillError(t('groups.needBillTitle'));
      return;
    }
    if (!bill.amount || Number(bill.amount) <= 0) {
      setBillError(t('groups.needAmount'));
      return;
    }
    if (bill.paidByIndex === '' || bill.paidByIndex === null) {
      setBillError(t('groups.needPayer'));
      return;
    }

    const payload = {
      title: bill.title.trim(),
      amount: bill.amount.trim(),
      date: bill.date || todayISO(),
      categoryId: bill.categoryId || null,
      paidByIndex: bill.paidByIndex,
      splitType,
      note: bill.note.trim(),
    };

    if (splitType === 'shares') {
      payload.shares = members.map((member) => ({
        memberIndex: member.index,
        // an empty box is a normal share, not a dropped person
        value: String(splitValues[member.index] ?? '').trim() || '1',
      }));
    }
    if (splitType === 'exact') {
      const rows = members.map((member) => ({
        memberIndex: member.index,
        value: String(splitValues[member.index] ?? '').trim(),
      }));
      if (rows.some((row) => !row.value)) {
        setBillError(t('groups.needExact'));
        return;
      }
      payload.shares = rows;
    }

    setSaving(true);
    try {
      await api.post(`/api/groups/${groupId}/expenses`, payload);
      setBill({ ...BLANK_BILL, date: bill.date, paidByIndex: bill.paidByIndex });
      setSplitValues({});
      setSplitType('equal');
      push(t('groups.billAdded'));
      load();
    } catch (err) {
      setBillError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function addMate(event) {
    event.preventDefault();
    setMateError('');
    if (!mate.name.trim() && !mate.email.trim()) {
      setMateError(t('groups.needMate'));
      return;
    }
    try {
      await api.post(`/api/groups/${groupId}/members`, {
        name: mate.name.trim(),
        email: mate.email.trim(),
      });
      setMate({ name: '', email: '' });
      push(t('groups.mateAdded'));
      load();
    } catch (err) {
      setMateError(err.message);
    }
  }

  /** Open the settle sheet, pre-filled with the pair that actually owes. */
  function openSettle(fromIndex) {
    const balances = data?.balances || [];
    const debtors = balances.filter((b) => b.net < 0);
    const creditors = balances.filter((b) => b.net > 0).sort((a, b) => b.net - a.net);
    const from = fromIndex ?? debtors[0]?.memberIndex;
    // default to what this person still owes — a part payment is one edit away
    const outstanding =
      from === undefined ? 0 : Math.abs(Number((balances.find((b) => b.memberIndex === from)?.net ?? 0).toFixed(2)));
    setSettle({
      fromIndex: from === undefined ? '' : String(from),
      toIndex: creditors[0] ? String(creditors[0].memberIndex) : '',
      amount: outstanding ? String(outstanding) : '',
      note: '',
    });
    setSettleError('');
  }

  async function saveSettlement(event) {
    event.preventDefault();
    setSettleError('');
    if (settle.fromIndex === '' || settle.toIndex === '') {
      setSettleError(t('groups.needPair'));
      return;
    }
    if (!settle.amount || Number(settle.amount) <= 0) {
      setSettleError(t('groups.needAmount'));
      return;
    }
    try {
      await api.post(`/api/groups/${groupId}/settle`, {
        fromIndex: settle.fromIndex,
        toIndex: settle.toIndex,
        amount: settle.amount.trim(),
        note: settle.note.trim(),
      });
      setSettle(null);
      push(t('groups.settledToast'));
      load();
    } catch (err) {
      setSettleError(err.message);
    }
  }

  async function runOwnerAction() {
    const what = confirming;
    setConfirming(null);
    try {
      if (what === 'delete') {
        await api.del(`/api/groups/${groupId}`);
        push(t('groups.deleted'));
        onBack();
        return;
      }
      await api.patch(`/api/groups/${groupId}`, { archived: !data?.group?.archived });
      push(data?.group?.archived ? t('groups.reopened') : t('groups.archivedToast'));
      load();
    } catch (err) {
      push(err.message, 'error');
    }
  }

  if (error && !data) {
    return (
      <Page
        trail={[{ label: t('groups.title') }, { label: t('groups.notFound') }]}
        title={t('groups.title')}
      >
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <Icon name="arrowLeft" size={16} /> {t('groups.back')}
        </button>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page trail={[{ label: t('groups.title') }]} title={t('groups.title')}>
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 120 }} />
          <p className="smallish muted mb-0 mt-3">{t('groups.loading')}</p>
        </div>
      </Page>
    );
  }

  const isOwner = data.group.isOwner;
  const debtors = data.balances.filter((b) => b.net < 0);
  const creditors = data.balances.filter((b) => b.net > 0).sort((a, b) => b.net - a.net);

  return (
    <Page
      trail={[{ label: t('groups.title') }, { label: data.group.name }]}
      title={data.group.name}
      subtitle={t('groups.detailSubtitle', {
        members: plural('groups.members', members.length, { n: members.length }),
        bills: plural('groups.bills', data.expenses.length, { n: data.expenses.length }),
        currency,
      })}
      actions={
        <>
          <button
            type="button"
            className="icon-btn"
            onClick={onBack}
            aria-label={t('groups.back')}
            title={t('groups.back')}
          >
            <Icon name="arrowLeft" />
          </button>
          {isOwner && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming('archive')}>
                {data.group.archived ? t('groups.reopen') : t('groups.archive')}
              </button>
              <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setConfirming('delete')}>
                {t('ui.delete')}
              </button>
            </>
          )}
        </>
      }
    >
      {data.group.archived && (
        <p className="smallish muted">
          <Icon name="pin" /> {t('groups.archivedNote')}
        </p>
      )}

      {/* ---------------------------------- members --------------------------------- */}
      <div className="card mb-3">
        <div className="card-title">
          <span>{t('groups.membersTitle')}</span>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {members.map((member) => (
            <li key={member.index} className="d-flex align-items-center gap-2 flex-wrap" style={{ padding: '6px 0' }}>
              <span className="txn-ico" style={{ width: 32, height: 32 }}>
                <Icon name="user" size={17} />
              </span>
              <span style={{ minWidth: 0 }}>
                <strong>{member.name}</strong>
                {member.isOwner && <span className="pill" style={{ marginLeft: 8 }}>{t('groups.owner')}</span>}
                {member.index === myIndex && <span className="pill" style={{ marginLeft: 8 }}>{t('groups.you')}</span>}
                {!member.user && (
                  <span className="smallish muted" style={{ marginLeft: 8 }}>
                    {t('groups.notRegistered')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {isOwner && (
          <form className="d-flex gap-2 align-items-end flex-wrap" onSubmit={addMate} noValidate style={{ marginTop: 12 }}>
            {mateError && (
              <div className="field-error w-100 mb-0" role="alert">
                <Icon name="warning" />
                <span>{mateError}</span>
              </div>
            )}
            <div style={{ flex: '1 1 160px' }}>
              <FormField label={t('groups.mateName')} htmlFor="mate-name">
                {(a) => (
                  <input
                    id="mate-name"
                    className="input"
                    type="text"
                    maxLength={80}
                    autoComplete="off"
                    value={mate.name}
                    onChange={(e) => setMate((form) => ({ ...form, name: e.target.value }))}
                    {...a}
                  />
                )}
              </FormField>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <FormField label={t('groups.mateEmail')} htmlFor="mate-email" hint={t('groups.mateEmailHint')}>
                {(a) => (
                  <input
                    id="mate-email"
                    className="input"
                    type="email"
                    autoComplete="off"
                    value={mate.email}
                    onChange={(e) => setMate((form) => ({ ...form, email: e.target.value }))}
                    {...a}
                  />
                )}
              </FormField>
            </div>
            <div style={{ paddingBottom: 16 }}>
              <button type="submit" className="btn btn-secondary">
                <Icon name="plus" size={15} /> {t('groups.addRoommate')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ----------------------------------- bills ---------------------------------- */}
      <form className="card mb-3" onSubmit={saveBill} noValidate>
        <div className="card-title">
          <span>{t('groups.addBill')}</span>
        </div>
        {billError && (
          <div className="field-error mb-3" role="alert">
            <Icon name="warning" />
            <span>{billError}</span>
          </div>
        )}

        <div className="d-flex gap-2 flex-wrap align-items-end">
          <div style={{ flex: '2 1 200px' }}>
            <FormField label={t('groups.billName')} htmlFor="bill-title">
              {(a) => (
                <input
                  id="bill-title"
                  className="input"
                  type="text"
                  maxLength={80}
                  autoComplete="off"
                  placeholder={t('groups.billNamePlaceholder')}
                  value={bill.title}
                  onChange={(e) => setBillField('title', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <FormField label={t('ui.amount')} htmlFor="bill-amount" help={t('groups.amountIn', { currency })}>
              {(a) => (
                <input
                  id="bill-amount"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={bill.amount}
                  onChange={(e) => setBillField('amount', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <FormField label={t('ui.date')} htmlFor="bill-date">
              {(a) => (
                <input
                  id="bill-date"
                  className="input"
                  type="date"
                  value={bill.date}
                  onChange={(e) => setBillField('date', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap align-items-end">
          <div style={{ flex: '1 1 180px' }}>
            <FormField label={t('groups.paidBy')} htmlFor="bill-payer">
              {(a) => (
                <select
                  id="bill-payer"
                  className="input"
                  value={bill.paidByIndex}
                  onChange={(e) => setBillField('paidByIndex', e.target.value)}
                  {...a}
                >
                  {members.map((member) => (
                    <option key={member.index} value={member.index}>
                      {member.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
          <div style={{ flex: '2 1 220px' }}>
            <FormField label={t('ui.note')} htmlFor="bill-note">
              {(a) => (
                <input
                  id="bill-note"
                  className="input"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  value={bill.note}
                  onChange={(e) => setBillField('note', e.target.value)}
                  {...a}
                />
              )}
            </FormField>
          </div>
        </div>

        <div className="field">
          <span id="bill-cat-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
            {t('ui.category')}
          </span>
          <div className="chip-grid" role="group" aria-labelledby="bill-cat-label">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="chip"
                aria-pressed={bill.categoryId === category.id}
                onClick={() => setBillField('categoryId', bill.categoryId === category.id ? '' : category.id)}
              >
                <CategoryIcon name={category.icon} /> {category.name}
              </button>
            ))}
            {categories.length === 0 && <span className="muted smallish">{t('groups.noCategories')}</span>}
          </div>
        </div>

        <div className="field">
          <span id="bill-split-label" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>
            {t('groups.splitHow')}
          </span>
          <div className="chip-grid" role="group" aria-labelledby="bill-split-label">
            {SPLIT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="chip"
                aria-pressed={splitType === type}
                onClick={() => setSplitType(type)}
              >
                {t(SPLIT_LABEL[type])}
              </button>
            ))}
          </div>
          <p className="field-help mb-0">
            {t(
              splitType === 'equal'
                ? 'groups.splitEqualHelp'
                : splitType === 'shares'
                  ? 'groups.splitSharesHelp'
                  : 'groups.splitExactHelp'
            )}
          </p>
        </div>

        {splitType !== 'equal' && (
          <div className="d-flex gap-2 flex-wrap">
            {members.map((member) => (
              <div key={member.index} style={{ flex: '1 1 150px' }}>
                <FormField
                  label={t(splitType === 'shares' ? 'groups.shareFor' : 'groups.exactFor', { name: member.name })}
                  htmlFor={`bill-split-${splitType}-${member.index}`}
                >
                  {(a) => (
                    <input
                      id={`bill-split-${splitType}-${member.index}`}
                      className="input"
                      type="text"
                      inputMode="decimal"
                      placeholder={splitType === 'shares' ? '1' : '0.00'}
                      value={splitValues[member.index] ?? ''}
                      onChange={(e) =>
                        setSplitValues((rows) => ({ ...rows, [member.index]: e.target.value }))
                      }
                      {...a}
                    />
                  )}
                </FormField>
              </div>
            ))}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving || members.length === 0}>
          {saving && <span className="spinner" aria-hidden="true" />}
          {t('groups.addBill')}
        </button>
        {members.length === 0 && <p className="smallish muted mb-0 mt-2">{t('groups.needOneMate')}</p>}
      </form>

      {/* ---------------------------------- balances -------------------------------- */}
      <div className="card mb-3">
        <div className="card-title">
          <span>{t('groups.balances')}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openSettle()}
            disabled={debtors.length === 0 || creditors.length === 0}
          >
            <Icon name="checkCircle" size={15} /> {t('groups.settleUp')}
          </button>
        </div>
        <p className="smallish muted">{t('groups.balancesHelp')}</p>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.balances.map((row) => {
            const settled = Number(row.net) === 0;
            return (
              <li
                key={row.memberIndex}
                className="d-flex align-items-center gap-2 flex-wrap"
                style={{ padding: '8px 0', borderTop: '1px solid var(--cc-border)' }}
              >
                <span style={{ minWidth: 0, flex: '1 1 120px' }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{row.name}</strong>
                  <br />
                  <span className="smallish muted">
                    {t('groups.paidShare', {
                      paid: amount(row.paid, currency),
                      share: amount(row.share, currency),
                    })}
                    {row.settledIn > 0 ? ` · ${t('groups.settledInShort', { amount: amount(row.settledIn, currency) })}` : ''}
                    {row.settledOut > 0 ? ` · ${t('groups.settledOutShort', { amount: amount(row.settledOut, currency) })}` : ''}
                  </span>
                </span>

                <span
                  className={`pill ${settled ? '' : row.net > 0 ? 'pill-income' : 'pill-expense'}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Icon name={settled ? 'check' : row.net > 0 ? 'trendUp' : 'trendDown'} size={13} />
                  {' '}
                  {t(
                    settled
                      ? 'groups.netSquare'
                      : row.net > 0
                        ? 'groups.netOwed'
                        : 'groups.netOwing'
                  )}
                </span>

                <span className="num" style={{ whiteSpace: 'nowrap' }}>
                  {amount(Math.abs(row.net), currency)}
                </span>

                {!settled && row.net < 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openSettle(row.memberIndex)}
                    aria-label={t('groups.settleUpAria', { name: row.name })}
                  >
                    {t('groups.settleUp')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* ----------------------------------- bills ---------------------------------- */}
      <div className="card mb-3">
        <div className="card-title">
          <span>{t('groups.billsTitle')}</span>
        </div>
        {data.expenses.length === 0 && <p className="muted mb-0">{t('groups.noBills')}</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.expenses.map((expense) => (
            <li key={expense.id} className="txn-row flex-wrap">
              <span className="txn-ico">
                <CategoryIcon name={expense.category?.icon} />
              </span>
              <span className="txn-main">
                <span className="txn-desc">{expense.title}</span>
                <span className="txn-meta">
                  {dayLabel(expense.date)} · {t('groups.paidByName', { name: expense.paidByName })}
                  {expense.category?.name ? ` · ${expense.category.name}` : ''}
                  <br />
                  <span className="smallish">
                    {t('groups.splitLabel')} {splitSummary(expense, members, currency, t, plural)}
                  </span>
                </span>
              </span>
              <span className="num" style={{ whiteSpace: 'nowrap' }}>
                {amount(expense.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* -------------------------------- settlements ------------------------------- */}
      <div className="card">
        <div className="card-title">
          <span>{t('groups.settlementsTitle')}</span>
        </div>
        {data.settlements.length === 0 && <p className="muted mb-0">{t('groups.noSettlements')}</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.settlements.map((row) => (
            <li key={row.id} className="d-flex align-items-center gap-2 flex-wrap" style={{ padding: '6px 0' }}>
              <span className="txn-ico" style={{ width: 32, height: 32 }}>
                <Icon name="checkCircle" size={17} />
              </span>
              <span style={{ flex: '1 1 140px', minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>
                  {t('groups.settledBetween', { from: row.fromName, to: row.toName })}
                </strong>
                <br />
                <span className="smallish muted">
                  {dayLabel(row.date)}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
              </span>
              <span className="num" style={{ whiteSpace: 'nowrap' }}>
                {amount(row.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {settle && (
        <Modal
          title={t('groups.settleTitle')}
          onClose={() => setSettle(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSettle(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="groups-settle-form" className="btn btn-primary">
                {t('groups.settleUp')}
              </button>
            </>
          }
        >
          <form id="groups-settle-form" onSubmit={saveSettlement} noValidate>
            {settleError && (
              <div className="field-error mb-3" role="alert">
                <Icon name="warning" />
                <span>{settleError}</span>
              </div>
            )}

            <FormField label={t('groups.settleFrom')} htmlFor="settle-from">
              {(a) => (
                <select
                  id="settle-from"
                  className="input"
                  value={settle.fromIndex}
                  onChange={(e) => setSettle((form) => ({ ...form, fromIndex: e.target.value }))}
                  {...a}
                >
                  <option value="">{t('groups.choosePerson')}</option>
                  {members.map((member) => (
                    <option key={member.index} value={member.index}>
                      {member.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={t('groups.settleTo')} htmlFor="settle-to">
              {(a) => (
                <select
                  id="settle-to"
                  className="input"
                  value={settle.toIndex}
                  onChange={(e) => setSettle((form) => ({ ...form, toIndex: e.target.value }))}
                  {...a}
                >
                  <option value="">{t('groups.choosePerson')}</option>
                  {members.map((member) => (
                    <option key={member.index} value={member.index}>
                      {member.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label={t('groups.settleAmount')}
              htmlFor="settle-amount"
              help={t('groups.settleAmountHelp', { currency })}
            >
              {(a) => (
                <input
                  id="settle-amount"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={settle.amount}
                  onChange={(e) => setSettle((form) => ({ ...form, amount: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('ui.note')} htmlFor="settle-note">
              {(a) => (
                <input
                  id="settle-note"
                  className="input"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  placeholder={t('groups.settleNotePlaceholder')}
                  value={settle.note}
                  onChange={(e) => setSettle((form) => ({ ...form, note: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}

      {confirming && (
        <Modal
          title={t(confirming === 'delete' ? 'groups.deleteTitle' : 'groups.archiveTitle')}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                {t('ui.cancel')}
              </button>
              <button
                type="button"
                className={confirming === 'delete' ? 'btn btn-danger-outline' : 'btn btn-primary'}
                onClick={runOwnerAction}
              >
                {t(confirming === 'delete' ? 'groups.deleteBtn' : data.group.archived ? 'groups.reopen' : 'groups.archiveBtn')}
              </button>
            </>
          }
        >
          <p className="mb-0">
            {t(confirming === 'delete' ? 'groups.deleteBody' : 'groups.archiveBody', { name: data.group.name })}
          </p>
        </Modal>
      )}
    </Page>
  );
}

/** "Split: 3 ways" / "Split: Aisha ×2, Bilal ×1" / "Split: Aisha 10.00" */
function splitSummary(expense, members, currency, t, plural) {
  const nameAt = (index) => members.find((member) => member.index === index)?.name || '';
  if (expense.splitType === 'shares') {
    return (expense.shares || [])
      .map((row) => `${nameAt(row.memberIndex)} ×${row.value}`)
      .join(', ');
  }
  if (expense.splitType === 'exact') {
    return (expense.split || [])
      .map((row) => `${nameAt(row.memberIndex)} ${amount(row.amount, currency)}`)
      .join(', ');
  }
  return plural('groups.splitEqualSummary', members.length, { n: members.length });
}
