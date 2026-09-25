import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import ChartCard from '../components/ChartCard.jsx';
import { categoryColor } from '../chartColors.js';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { money } from '../money.js';
import { useLocale } from '../locale.jsx';
import { uiLang } from '../dates.js';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(uiLang(), { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

const TABS = [
  { id: 'category', label: 'rep.tabCategory' },
  { id: 'trend', label: 'rep.tabTrend' },
  { id: 'daily', label: 'rep.tabDaily' },
];

/* The report payload differs slightly per tab — read it the forgiving way. */

function readCategoryRows(data, t) {
  const source = data?.rows || data?.categories || data?.category || [];
  if (!Array.isArray(source)) return [];

  const mapped = source.map((r) => {
    const name = typeof r.category === 'string' ? r.category : r.category?.name || r.name || r.label || 'Other';
    return {
      name,
      amount: Number(r.amount ?? r.total ?? r.value ?? 0),
      pct: r.pct ?? r.share ?? r.percentage ?? null,
      change: r.changePct ?? r.vsLastMonth ?? r.change ?? null,
      previous: r.previous ?? r.prevAmount ?? r.lastMonth ?? null,
    };
  });

  const total = mapped.reduce((sum, row) => sum + row.amount, 0);
  return mapped.map((row) => {
    let changeText = '—';
    if (row.change !== null && row.change !== undefined && row.change !== '') {
      const n = Number(row.change);
      if (Number.isNaN(n)) changeText = String(row.change);
      else if (n > 0) changeText = `↑ +${Math.round(n)}%`;
      else if (n < 0) changeText = `↓ ${Math.round(n)}%`;
      else changeText = '→ 0%';
    } else if (row.previous !== null && row.previous !== undefined) {
      const prev = Number(row.previous);
      if (prev > 0) {
        const n = ((row.amount - prev) / prev) * 100;
        changeText = n >= 0 ? `↑ +${Math.round(n)}%` : `↓ ${Math.round(n)}%`;
      } else if (row.amount > 0) {
        changeText = t('rep.newChange');
      }
    }

    const pct = row.pct !== null ? Math.round(Number(row.pct)) : total > 0 ? Math.round((row.amount / total) * 100) : 0;
    return { ...row, pct, changeText };
  });
}

function readTrendRows(data) {
  const source = data?.rows || data?.trend || data?.months || [];
  if (!Array.isArray(source)) return [];
  return source.map((r) => ({
    label: r.label || r.month || r.key || '',
    income: Number(r.income ?? 0),
    expense: Number(r.expense ?? r.spent ?? 0),
  }));
}

function readDailyRows(data) {
  const source = data?.days || data?.daily || data?.rows || [];
  if (!Array.isArray(source)) return [];
  return source
    .filter((r) => r.day !== undefined || r.date !== undefined)
    .map((r) => ({
      day: r.day ?? Number(String(r.date).slice(8, 10)),
      // the report sends `expense`; the older keys stay for old exports
      amount: Number(r.amount ?? r.total ?? r.value ?? r.expense ?? 0),
    }));
}

function readWeekRows(data, t) {
  const source = data?.weeks || data?.weekly || [];
  if (!Array.isArray(source)) return [];
  return source.map((r) => ({
    label: r.label || r.week || t('rep.weekN', { n: r.weekNumber ?? '' }),
    amount: Number(r.amount ?? r.total ?? r.value ?? r.expense ?? 0),
  }));
}

/**
 * Monthly reports (REP-1..5): three views of the same month, and exports
 * that only ever run when someone presses the button.
 */
export default function Reports() {
  const { t } = useLocale();
  const { push } = useToast();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [tab, setTab] = useState('category');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [share, setShare] = useState({ email: '', message: '' });
  const [sharing, setSharing] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .get(`/api/reports${qs({ month, tab })}`)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        push(err.message, 'error');
      });
    return () => {
      alive = false;
    };
  }, [month, tab, push]);

  /** Client-side snapshot — strictly on this click, never on load. */
  async function exportImage() {
    const node = reportRef.current;
    if (!node || capturing) return;
    setCapturing(true);
    try {
      const canvas = await html2canvas(node, { backgroundColor: getComputedStyle(document.body).backgroundColor });
      canvas.toBlob((blob) => {
        if (!blob) {
          push(t('rep.imgFail'), 'error');
          setCapturing(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `campuscoin-report-${month}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setCapturing(false);
      }, 'image/png');
    } catch (err) {
      setCapturing(false);
      push(err.message || t('rep.imgFail2'), 'error');
    }
  }

  async function sendByEmail(event) {
    event.preventDefault();
    setSharing(true);
    try {
      await api.post('/api/reports/share', { month, email: share.email, message: share.message });
      setShareOpen(false);
      push(t('rep.emailed', { month: monthLabel(month), email: share.email }));
      setShare({ email: '', message: '' });
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSharing(false);
    }
  }

  /* ------------------------------- per-tab views ------------------------------ */

  const categoryRows = tab === 'category' ? readCategoryRows(data, t) : [];
  const trendRows = tab === 'trend' ? readTrendRows(data) : [];
  const dailyRows = tab === 'daily' ? readDailyRows(data) : [];
  const weekRows = tab === 'daily' ? readWeekRows(data, t) : [];

  const views = {
    category: {
      chart: (
        <ChartCard
          title={t('dash.chartSpending')}
          type="bar"
          data={{
            labels: categoryRows.map((r) => r.name),
            datasets: [{
              label: t('ui.amount'),
              data: categoryRows.map((r) => r.amount),
              // each bar wears its category's colour, same as the doughnut
              backgroundColor: categoryRows.map((r) => categoryColor(r.name)),
            }],
          }}
          loading={!data}
          emptyText={t('rep.emptyNoExpenses')}
          table={{
            columns: [t('ui.category'), t('ui.amount'), t('ui.pctOfTotal'), t('ui.vsLastMonth')],
            rows: categoryRows.map((r) => [r.name, money(r.amount), `${r.pct}%`, r.changeText]),
          }}
        />
      ),
      table: {
        columns: [t('ui.category'), t('ui.amount'), t('ui.pctOfTotal'), t('ui.vsLastMonth')],
        rows: categoryRows.map((r) => [r.name, money(r.amount), `${r.pct}%`, r.changeText]),
      },
      empty: !data ? null : categoryRows.length === 0,
      emptyText: t('rep.emptyNothingLogged'),
    },
    trend: {
      chart: (
        <ChartCard
          title={t('rep.tabTrend')}
          type="bar"
          data={{
            labels: trendRows.map((r) => r.label),
            datasets: [
              { label: t('ui.income'), data: trendRows.map((r) => r.income), backgroundColor: 'var(--cc-income)' },
              { label: t('ui.expense'), data: trendRows.map((r) => r.expense), backgroundColor: 'var(--cc-expense)' },
            ],
          }}
          loading={!data}
          emptyText={t('rep.emptySixMonths')}
          table={{
            columns: [t('ui.month'), t('ui.income'), t('ui.expense')],
            rows: trendRows.map((r) => [r.label, money(r.income), money(r.expense)]),
          }}
        />
      ),
      table: {
        columns: [t('ui.month'), t('ui.income'), t('ui.expense')],
        rows: trendRows.map((r) => [r.label, money(r.income), money(r.expense)]),
      },
      empty: !data ? null : trendRows.length === 0,
      emptyText: t('rep.emptyNoMonths'),
    },
    daily: {
      chart: (
        <ChartCard
          title={t('rep.chartDaily', { month: monthLabel(month) })}
          type="line"
          data={{
            labels: dailyRows.map((r) => String(r.day).padStart(2, '0')),
            datasets: [{ label: t('ui.spent'), data: dailyRows.map((r) => r.amount), tension: 0.3, fill: true }],
          }}
          loading={!data}
          emptyText={t('rep.emptyNoDaily')}
          table={{
            columns: weekRows.length ? [t('ui.week'), t('ui.amount')] : [t('ui.day'), t('ui.amount')],
            rows: weekRows.length
              ? weekRows.map((w) => [w.label, money(w.amount)])
              : dailyRows.map((d) => [String(d.day).padStart(2, '0'), money(d.amount)]),
          }}
        />
      ),
      table: weekRows.length
        ? { columns: [t('ui.week'), t('ui.amount')], rows: weekRows.map((w) => [w.label, money(w.amount)]) }
        : { columns: [t('ui.day'), t('ui.amount')], rows: dailyRows.map((d) => [String(d.day).padStart(2, '0'), money(d.amount)]) },
      empty: !data ? null : dailyRows.length === 0 && weekRows.length === 0,
      emptyText: t('rep.emptyNothingSpent'),
    },
  };

  const view = views[tab];

  return (
    <Page
      trail={[
        { label: t('nav.reports') },
        { label: monthLabel(month) },
      ]}
      title={t('nav.reports')}
      subtitle={t('rep.subtitle')}
    >
      <div className="d-flex gap-2 flex-wrap align-items-center justify-content-between mb-3">
        <div className="d-flex gap-1 flex-wrap align-items-center" role="group" aria-label={t('rep.viewAria')}>
          {TABS.map((tabDef) => (
            <button
              key={tabDef.id}
              type="button"
              className={`btn ${tab === tabDef.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              aria-pressed={tab === tabDef.id}
              onClick={() => setTab(tabDef.id)}
            >
              {t(tabDef.label)}
            </button>
          ))}
        </div>

        <div className="d-flex gap-1 flex-wrap align-items-center">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label={t('ui.prevMonth')}
            title={t('ui.prevMonth')}
          >
            ‹
          </button>
          <strong className="num" style={{ minWidth: 140, textAlign: 'center' }}>
            {monthLabel(month)}
          </strong>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label={t('ui.nextMonth')}
            title={t('ui.nextMonth')}
          >
            ›
          </button>
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap justify-content-end mb-3">
        <a className="btn btn-secondary btn-sm" href={`/api/reports/export/pdf?month=${month}`}>
          {t('rep.exportPdf')}
        </a>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportImage} disabled={capturing}>
          {capturing && <span className="spinner" aria-hidden="true" />}
          {capturing ? t('rep.preparing') : t('rep.exportImage')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShareOpen(true)}>
          {t('rep.emailBtn')}
        </button>
      </div>

      {error && (
        <div className="field-error mb-3" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div ref={reportRef}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="mb-0">{t(TABS.find((x) => x.id === tab)?.label)}</h2>
          <span className="smallish muted num">{monthLabel(month)}</span>
        </div>

        {!data && !error && (
          <div className="card" role="status">
            <div className="d-flex align-items-center gap-2 muted">
              <span className="spinner" aria-hidden="true" />
              {t('rep.building')}
            </div>
            <div className="skeleton mt-3" style={{ height: 220 }} />
          </div>
        )}

        {data && view.empty && (
          <div className="card">
            <p className="muted mb-0">{view.emptyText}</p>
          </div>
        )}

        {data && !view.empty && (
          <>
            {view.chart}
            <div className="card mt-3">
              <div className="card-title">
                <span>{t('rep.sameNumbers')}</span>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <caption className="visually-hidden">{t('rep.caption', { month: monthLabel(month) })}</caption>
                  <thead>
                    <tr>
                      {view.table.columns.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={j > 0 ? 'num' : undefined}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {shareOpen && (
        <Modal
          title={t('rep.shareTitle')}
          onClose={() => setShareOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShareOpen(false)}>
                {t('ui.cancel')}
              </button>
              <button type="submit" form="report-share-form" className="btn btn-primary" disabled={sharing}>
                {sharing && <span className="spinner" aria-hidden="true" />}
                {sharing ? t('rep.sending') : t('ui.send')}
              </button>
            </>
          }
        >
          <form id="report-share-form" onSubmit={sendByEmail} noValidate>
            <FormField label={t('ui.sendTo')} htmlFor="share-email" help={t('rep.attachHelp', { month: monthLabel(month) })}>
              {(a) => (
                <input
                  id="share-email"
                  type="email"
                  className="input"
                  required
                  autoComplete="email"
                  value={share.email}
                  onChange={(e) => setShare((s) => ({ ...s, email: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
            <FormField label={t('rep.messageOptional')} htmlFor="share-message">
              {(a) => (
                <textarea
                  id="share-message"
                  className="input"
                  rows={3}
                  maxLength={500}
                  value={share.message}
                  onChange={(e) => setShare((s) => ({ ...s, message: e.target.value }))}
                  {...a}
                />
              )}
            </FormField>
          </form>
        </Modal>
      )}
    </Page>
  );
}
