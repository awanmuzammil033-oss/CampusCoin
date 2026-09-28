import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';

/**
 * The subscription vault: what leaves the account every month, which of those
 * payments look like they are bought for nothing, and one button to stop the
 * ones that are.
 *
 * Two rules keep this screen honest. Every sentence comes from the dictionary
 * (the page is fully translatable), and every number is the one the service
 * sent — the page never adds money up itself. Where a key is missing from a
 * dictionary, the English sentence the API carries is used rather than showing
 * a raw key.
 */

/** Note vars that are amounts: formatted in the student's own currency. */
const MONEY_VARS = new Set(['amount', 'monthly', 'from', 'to']);

/** The five verdicts, each with its own chip colour and glyph. */
const VERDICT = {
  'in-use': { key: 'vault.verdictInUse', cls: 'pill pill-income', icon: 'checkCircle' },
  idle: { key: 'vault.verdictIdle', cls: 'pill pill-expense', icon: 'hourglass' },
  'price-creep': { key: 'vault.verdictPriceCreep', cls: 'pill pill-suggest', icon: 'trendUp' },
  duplicate: {
    key: 'vault.verdictDuplicate',
    cls: 'pill',
    icon: 'copy',
    style: { background: 'var(--cc-danger-soft)', color: 'var(--cc-danger)' },
  },
  'one-off': { key: 'vault.verdictOneOff', cls: 'pill', icon: 'repeat' },
};

const FLAG_ORDER = ['duplicate', 'idle', 'price-creep', 'one-off'];

/** Dictionary first, English from the API second, raw key never. */
function pick(t, key, vars, fallback) {
  const text = t(key, vars);
  return text === key ? fallback : text;
}

function noteVars(row) {
  const out = {};
  Object.entries(row.noteVars || {}).forEach(([name, value]) => {
    out[name] = MONEY_VARS.has(name) ? money(value) : value;
  });
  return out;
}

function noteText(t, row) {
  return pick(t, row.noteKey, noteVars(row), row.note);
}

function frequencyLabel(t, row) {
  if (row.frequency === 'weekly') return t('rec.weekly');
  if (row.frequency === 'monthly') return t('rec.monthly');
  return t('vault.frequencyNone');
}

function titleOf(t, row) {
  return row.title || t('rec.untitled');
}

function lastChargeText(t, plural, row) {
  if (row.lastCharge === null || row.lastCharge === undefined) return t('vault.neverCharged');
  return plural('vault.lastCharged', row.daysSinceLastCharge, { n: row.daysSinceLastCharge });
}

/** The headline number on the strip, and the line under it. */
function Headline({ icon, label, value, note }) {
  return (
    <div className="card">
      <div className="card-title">
        <span>
          <Icon name={icon} /> {label}
        </span>
      </div>
      <div className="balance-display">{value}</div>
      <p className="smallish muted mb-0 mt-2">{note}</p>
    </div>
  );
}

export default function VaultPage() {
  const { t, plural } = useLocale();
  const { push } = useToast();

  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    return api
      .get('/api/vault')
      .then((data) => setReport(data))
      .catch((err) => {
        setError(err.message);
        push(err.message, 'error');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmCancel() {
    const target = cancelling;
    setBusy(true);
    try {
      const res = await api.post('/api/vault/cancel', { ruleId: target.ruleId });
      setCancelling(null);
      push(res.wasActive ? t('vault.cancelled', { name: titleOf(t, target) }) : t('vault.alreadyPaused'));
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const rows = report?.detected || [];
  const flagged = rows.filter((row) => FLAG_ORDER.includes(row.verdict));
  const shown = flagged.slice(0, 3);

  return (
    <Page loading={!report && !error} trail={[{ label: t('vault.title') }]} title={t('vault.title')} subtitle={t('vault.subtitle')}>
      {error && (
        <div className="field-error mb-3" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      {!report && !error && (
        <div className="card" role="status">
          <div className="skeleton" style={{ height: 44, width: '45%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 16, width: '55%' }} />
          <p className="smallish muted mb-0 mt-3">{t('vault.loading')}</p>
        </div>
      )}

      {report && (
        <>
          {/* the three numbers that matter, in one strip */}
          <div className="d-grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Headline
              icon="repeat"
              label={t('vault.monthlyLabel')}
              value={money(report.monthlyTotal)}
              note={t('vault.monthlyNote')}
            />
            <Headline
              icon="calendar"
              label={t('vault.annualLabel')}
              value={money(report.annualTotal)}
              note={t('vault.annualNote')}
            />
            <Headline
              icon="piggy"
              label={t('vault.savingLabel')}
              value={money(report.savings.annual)}
              note={report.savings.total > 0 ? t('vault.savingNote') : t('vault.savingClean')}
            />
          </div>

          {flagged.length > 0 && (
            <section className="card mb-3" aria-label={t('vault.alertListAria')}>
              <div className="card-title">
                <span>
                  <Icon name="warning" /> {t('vault.alertsTitle')}
                </span>
                <span className="pill pill-expense">
                  {plural('vault.flagged', flagged.length, { n: flagged.length })}
                </span>
              </div>
              <ul className="d-grid gap-2 mb-0" style={{ listStyle: 'none', margin: 0, padding: 0 }} role="list">
                {shown.map((row) => {
                  const chip = VERDICT[row.verdict] || VERDICT['in-use'];
                  return (
                    <li key={row.key} className="d-flex align-items-start gap-2 flex-wrap">
                      <span className={chip.cls} style={chip.style}>
                        <Icon name={chip.icon} size={13} /> {pick(t, chip.key, null, row.verdictLabel)}
                      </span>
                      <span className="smallish flex-grow-1">
                        {titleOf(t, row)} — {noteText(t, row)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {flagged.length > shown.length && (
                <p className="smallish muted mb-0 mt-2">{t('vault.moreFlagged', { n: flagged.length - shown.length })}</p>
              )}
            </section>
          )}

          {rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="repeat"
                title={t('vault.emptyTitle')}
                action={
                  <Link className="btn btn-primary mt-2" to="/recurring">
                    {t('vault.emptyBtn')}
                  </Link>
                }
              >
                {t('vault.emptyBody')}
              </EmptyState>
            </div>
          ) : (
            <>
              <p className="smallish muted mb-2">{plural('vault.count', rows.length, { n: rows.length })}</p>
              <div className="d-grid gap-3">
                {rows.map((row) => (
                  <SubscriptionCard
                    key={row.key}
                    t={t}
                    plural={plural}
                    row={row}
                    busy={busy}
                    onCancel={() => setCancelling(row)}
                  />
                ))}
              </div>
            </>
          )}

          {report.rules && (
            <section className="card mt-3">
              <div className="card-title">
                <span>{t('vault.howTitle')}</span>
              </div>
              <ul className="smallish mb-0" style={{ paddingInlineStart: 18 }}>
                <li>{t('vault.howIdle', { days: report.rules.idleDays })}</li>
                <li>{t('vault.howCreep', { pct: report.rules.creepPct })}</li>
                <li>{t('vault.howDuplicate', { pct: report.rules.duplicatePct })}</li>
                <li>{t('vault.howOneOff', { count: report.rules.patternMinCharges })}</li>
              </ul>
              <p className="smallish muted mb-0 mt-3">
                {t('vault.committedNote', { amount: money(report.committedMonthly) })}
              </p>
            </section>
          )}
        </>
      )}

      {cancelling && (
        <Modal
          title={t('vault.cancelTitle')}
          onClose={() => setCancelling(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setCancelling(null)}>
                {t('ui.cancel')}
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={confirmCancel} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {t('vault.cancelBtn')}
              </button>
            </>
          }
        >
          <p>{t('vault.cancelBody', { name: titleOf(t, cancelling), amount: money(cancelling.monthly) })}</p>
          <p className="smallish muted mb-0">{t('vault.cancelKeeps')}</p>
        </Modal>
      )}
    </Page>
  );
}

/** One subscription: what it costs, when it last charged, and what to do. */
function SubscriptionCard({ t, plural, row, busy, onCancel }) {
  const chip = VERDICT[row.verdict] || VERDICT['in-use'];
  // A one-off has no entry to stop here, so there is nothing to cancel on this
  // screen — the note says so, and the button stays away.
  const canCancel = Boolean(
    (row.verdict === 'idle' || row.verdict === 'duplicate') && row.ruleId && row.active
  );

  return (
    <article className="card">
      <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <span className="txn-ico">
            <CategoryIcon name={row.category?.icon} />
          </span>
          <div>
            <h2 className="mb-0" style={{ fontSize: '1.0625rem' }}>
              {titleOf(t, row)}
            </h2>
            <span className="smallish muted">{row.category?.name || t('ui.category')}</span>
          </div>
        </div>
        <span className={chip.cls} style={chip.style}>
          <Icon name={chip.icon} size={13} /> {pick(t, chip.key, null, row.verdictLabel)}
        </span>
      </div>

      <div className="d-flex align-items-baseline gap-2 mt-3">
        <span className="num" style={{ fontSize: '1.375rem', fontWeight: 700 }}>
          {money(row.monthly)}
        </span>
        <span className="smallish muted">{t('vault.perMonth')}</span>
      </div>

      <p className="smallish muted mb-2">
        {frequencyLabel(t, row)} · {t('vault.eachCharge', { amount: money(row.amount) })} ·{' '}
        {lastChargeText(t, plural, row)}
      </p>

      <p className="mb-2">{noteText(t, row)}</p>

      <div className="d-flex gap-2 flex-wrap">
        {canCancel && (
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            onClick={onCancel}
            disabled={busy}
            aria-label={t('vault.cancelAria', { name: titleOf(t, row) })}
          >
            <Icon name="ban" size={15} /> {t('vault.cancelBtn')}
          </button>
        )}
        {!row.hasRule && (
          <span className="smallish muted d-inline-flex align-items-center gap-1">
            <Icon name="info" size={14} /> {t('vault.noRuleNote')}
          </span>
        )}
        {row.hasRule && !row.active && (
          <span className="pill">
            <Icon name="ban" size={13} /> {t('rec.paused')}
          </span>
        )}
      </div>
    </article>
  );
}
