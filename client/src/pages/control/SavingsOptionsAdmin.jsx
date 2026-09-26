import { useEffect, useState } from 'react';

import Page from '../../components/Page.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useLocale } from '../../locale.jsx';
import { moneyInLedger, ledgerCurrencySymbol } from '../../money.js';

const BLANK = {
  bank: '',
  accountType: 'savings',
  ratePercent: '',
  minAmount: '',
  tenureMonths: '',
  region: '',
  note: '',
  sourceNote: '',
  isActive: true,
};

/** "11.5%" — the % sign is a symbol, not a word, so it stays untranslated. */
function rateText(value) {
  return `${value}%`;
}

function readRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.rows || [];
}

/**
 * ADV-3, administrator side: publishing the reference rates students read.
 *
 * Two rules shape this form. First, the disclaimer is repeated inside it —
 * an administrator typing a number into a field that students may act on has
 * to be told, in the same screen, what they are publishing. Second, every row
 * carries a `sourceNote`: a rate without a source cannot be checked, and an
 * unchecked rate is how a wrong number ends up looking authoritative.
 *
 * Retiring a row (isActive off) keeps it out of the public table without
 * deleting the record of a figure that was once published.
 */
export default function SavingsOptionsAdmin() {
  const { push } = useToast();
  const { t, plural } = useLocale();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { mode, id?, ...fields }
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [removing, setRemoving] = useState(null);

  function load() {
    api
      .get('/api/control/savings-options')
      .then((payload) => {
        setRows(readRows(payload));
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

  function openNew() {
    setDraft({ mode: 'new', ...BLANK });
    setDraftError('');
  }

  function openEdit(row) {
    setDraft({
      mode: 'edit',
      id: row.id,
      bank: row.bank || '',
      accountType: row.accountType || 'savings',
      ratePercent: String(row.ratePercent ?? ''),
      minAmount: row.minAmount === null || row.minAmount === undefined ? '' : String(row.minAmount),
      tenureMonths: row.tenureMonths === null || row.tenureMonths === undefined ? '' : String(row.tenureMonths),
      region: row.region || '',
      note: row.note || '',
      sourceNote: row.sourceNote || '',
      isActive: row.isActive !== false,
    });
    setDraftError('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    setDraftError('');

    if (draft.mode === 'new' && !draft.bank.trim()) {
      setDraftError(t('sav.admin.needBank'));
      return;
    }
    if (!draft.ratePercent.trim()) {
      setDraftError(t('sav.admin.needRate'));
      return;
    }

    // Every number goes over the wire as the typed string: the service checks
    // the digits and the number of decimals, not a float the browser produced.
    const payload = {
      accountType: draft.accountType,
      ratePercent: draft.ratePercent.trim(),
      minAmount: draft.minAmount.trim() === '' ? null : draft.minAmount.trim(),
      tenureMonths: draft.tenureMonths.trim() === '' ? null : draft.tenureMonths.trim(),
      region: draft.region.trim(),
      note: draft.note.trim(),
      sourceNote: draft.sourceNote.trim(),
      isActive: draft.isActive,
    };

    setSaving(true);
    try {
      if (draft.mode === 'new') {
        await api.post('/api/control/savings-options', { bank: draft.bank.trim(), ...payload });
        push(t('sav.admin.created'));
      } else {
        await api.patch(`/api/control/savings-options/${draft.id}`, payload);
        push(t('sav.admin.updated'));
      }
      setDraft(null);
      load();
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    setBusyId(row.id);
    try {
      await api.patch(`/api/control/savings-options/${row.id}`, { isActive: !row.isActive });
      push(row.isActive ? t('sav.admin.retired') : t('sav.admin.published'));
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow() {
    setBusyId(removing.id);
    try {
      await api.del(`/api/control/savings-options/${removing.id}`);
      setRemoving(null);
      push(t('sav.admin.deleted'));
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      trail={[{ label: t('ctl.trail'), to: '/control' }, { label: t('sav.admin.title') }]}
      title={t('sav.admin.title')}
      subtitle={t('sav.admin.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          {t('sav.admin.newBtn')}
        </button>
      }
    >
      {/* The same sentence students read, kept in front of the person who
          publishes. Publishing is not advice, and this is where that is said
          before anything is saved. */}
      <div className="card mb-3" role="note">
        <p className="mb-1 d-flex align-items-center gap-2">
          <Icon name="warning" /> <strong>{t('sav.disclaimerTitle')}</strong>
        </p>
        <p className="mb-0">{t('sav.disclaimer')}</p>
        <p className="smallish muted mb-0 mt-2">{t('sav.admin.disclaimerReminder')}</p>
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span><Icon name="warning" /></span>
          <span>{error}</span>
        </div>
      )}

      {!rows && !error && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
          </div>
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
          </div>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="bank"
            title={t('sav.admin.emptyTitle')}
            action={
              <button type="button" className="btn btn-primary mt-2" onClick={openNew}>
                {t('sav.admin.createFirst')}
              </button>
            }
          >
            {t('sav.admin.emptyBody')}
          </EmptyState>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {rows.map((row) => (
            <article className="card" key={row.id}>
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <span className="num" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {rateText(row.ratePercent)}
                </span>
                <span className={row.isActive ? 'pill pill-income' : 'pill'}>
                  {row.accountType === 'fd' ? t('sav.fd') : t('sav.savings')}
                </span>
              </div>
              <h2 className="h3">{row.bank}</h2>
              <p className="smallish muted mb-2">
                {row.minAmount === null
                  ? t('sav.minimumNone')
                  : t('sav.admin.minimumIs', { amount: moneyInLedger(row.minAmount) })}
                {row.tenureMonths
                  ? ` · ${plural('sav.months', row.tenureMonths, { n: row.tenureMonths })}`
                  : ''}
                {row.region ? ` · ${row.region}` : ''}
              </p>
              {row.note && <p className="smallish mb-1">{row.note}</p>}
              <p className="smallish muted mb-0">
                <Icon name="file" size={14} /> {row.sourceNote || t('sav.sourceMissing')}
              </p>
              {!row.isActive && (
                <p className="smallish mb-0 mt-2">
                  <span className="pill">
                    <Icon name="ban" size={13} /> {t('sav.admin.retiredBadge')}
                  </span>
                </p>
              )}

              <div className="d-flex gap-2 flex-wrap align-items-center mt-3">
                <button
                  type="button"
                  className={`btn btn-sm ${row.isActive ? 'btn-secondary' : 'btn-primary'}`}
                  aria-pressed={Boolean(row.isActive)}
                  disabled={busyId === row.id}
                  onClick={() => toggleActive(row)}
                >
                  {row.isActive ? t('sav.admin.retireBtn') : t('sav.admin.publishBtn')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                  {t('ui.edit')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setRemoving(row)}
                  aria-label={t('sav.admin.removeAria', { bank: row.bank })}
                >
                  <Icon name="trash" size={15} /> {t('sav.admin.removeBtn')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.mode === 'new' ? t('sav.admin.newTitle') : t('sav.admin.editTitle')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="savings-rate-form" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? t('ui.saving') : t('ui.save')}
              </button>
            </>
          }
        >
          <form id="savings-rate-form" onSubmit={saveDraft} noValidate>
            {draftError && (
              <div className="field-error mb-3" role="alert">
                <span><Icon name="warning" /></span>
                <span>{draftError}</span>
              </div>
            )}

            {/* Inside the form, not above it: the reminder belongs to the act
                of publishing, so it is on screen while the fields are filled. */}
            <div className="card mb-3" role="note" style={{ padding: 14 }}>
              <p className="smallish mb-0 d-flex align-items-start gap-2">
                <Icon name="warning" />
                <span>
                  <strong>{t('sav.admin.reminderTitle')}</strong> {t('sav.disclaimer')}
                </span>
              </p>
            </div>

            {draft.mode === 'new' && (
              <FormField label={t('sav.bank')} htmlFor="rate-bank" help={t('sav.admin.bankHelp')}>
                {(a) => (
                  <input
                    id="rate-bank"
                    className="input"
                    type="text"
                    maxLength={60}
                    value={draft.bank}
                    onChange={(e) => setDraft((d) => ({ ...d, bank: e.target.value }))}
                    {...a}
                  />
                )}
              </FormField>
            )}

            <div className="field">
              <span
                id="rate-type-label"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
              >
                {t('ui.type')}
              </span>
              <div className="chip-grid" role="group" aria-labelledby="rate-type-label">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.accountType === 'savings'}
                  onClick={() => setDraft((d) => ({ ...d, accountType: 'savings' }))}
                >
                  {t('sav.savings')}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.accountType === 'fd'}
                  onClick={() => setDraft((d) => ({ ...d, accountType: 'fd' }))}
                >
                  {t('sav.fd')}
                </button>
              </div>
            </div>

            <FormField label={t('sav.rate')} htmlFor="rate-percent" help={t('sav.admin.rateHelp')}>
              {(a) => (
                <input
                  id="rate-percent"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="11.5"
                  value={draft.ratePercent}
                  onChange={(e) => setDraft((d) => ({ ...d, ratePercent: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField
              label={t('sav.minimum')}
              htmlFor="rate-minimum"
              help={t('sav.admin.minimumHelp')}
            >
              {(a) => (
                <div className="amount-wrap">
                  <span className="amount-prefix" aria-hidden="true">{ledgerCurrencySymbol()}</span>
                  <input
                    id="rate-minimum"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.minAmount}
                    onChange={(e) => setDraft((d) => ({ ...d, minAmount: e.target.value }))}
                    {...a}
                  />
                </div>
              )}
            </FormField>

            <FormField label={t('sav.tenure')} htmlFor="rate-tenure" help={t('sav.admin.tenureHelp')}>
              {(a) => (
                <input
                  id="rate-tenure"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="12"
                  value={draft.tenureMonths}
                  onChange={(e) => setDraft((d) => ({ ...d, tenureMonths: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('sav.region')} htmlFor="rate-region">
              {(a) => (
                <input
                  id="rate-region"
                  className="input"
                  type="text"
                  maxLength={60}
                  value={draft.region}
                  onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('sav.note')} htmlFor="rate-note" help={t('sav.admin.noteHelp')}>
              {(a) => (
                <input
                  id="rate-note"
                  className="input"
                  type="text"
                  maxLength={200}
                  value={draft.note}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <FormField label={t('sav.source')} htmlFor="rate-source" help={t('sav.admin.sourceHelp')}>
              {(a) => (
                <input
                  id="rate-source"
                  className="input"
                  type="text"
                  maxLength={200}
                  placeholder={t('sav.admin.sourcePlaceholder')}
                  value={draft.sourceNote}
                  onChange={(e) => setDraft((d) => ({ ...d, sourceNote: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>

            <div className="field">
              <span
                id="rate-active-label"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}
              >
                {t('sav.admin.visibility')}
              </span>
              <div className="chip-grid" role="group" aria-labelledby="rate-active-label">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={draft.isActive}
                  onClick={() => setDraft((d) => ({ ...d, isActive: true }))}
                >
                  {t('sav.admin.publishBtn')}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={!draft.isActive}
                  onClick={() => setDraft((d) => ({ ...d, isActive: false }))}
                >
                  {t('sav.admin.retireBtn')}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal
          title={t('sav.admin.removeTitle')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={removeRow}>
                {t('sav.admin.removeConfirm')}
              </button>
            </>
          }
        >
          <p className="mb-2">{t('sav.admin.removeBody', { bank: removing.bank, rate: rateText(removing.ratePercent) })}</p>
          <p className="smallish muted mb-0">{t('sav.admin.removeRetire')}</p>
        </Modal>
      )}
    </Page>
  );
}
