import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';

import Page from '../components/Page.jsx';
import Modal from '../components/Modal.jsx';
import FormField from '../components/FormField.jsx';
import ChartCard from '../components/ChartCard.jsx';
import { api, qs } from '../api.js';
import { useToast } from '../components/Toast.jsx';

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

const TABS = [
  { id: 'category', label: 'Category-wise' },
  { id: 'trend', label: 'Income vs expense (6 months)' },
  { id: 'daily', label: 'Daily & weekly' },
];

/* The report payload differs slightly per tab — read it the forgiving way. */

function readCategoryRows(data) {
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
        changeText = '↑ new';
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
      amount: Number(r.amount ?? r.total ?? r.value ?? 0),
    }));
}

function readWeekRows(data) {
  const source = data?.weeks || data?.weekly || [];
  if (!Array.isArray(source)) return [];
  return source.map((r) => ({
    label: r.label || r.week || `Week ${r.weekNumber ?? ''}`,
    amount: Number(r.amount ?? r.total ?? r.value ?? 0),
  }));
}

/**
 * Monthly reports (REP-1..5): three views of the same month, and exports
 * that only ever run when someone presses the button.
 */
export default function Reports() {
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
          push('The image could not be created — try again.', 'error');
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
      push(err.message || 'The image could not be created.', 'error');
    }
  }

  async function sendByEmail(event) {
    event.preventDefault();
    setSharing(true);
    try {
      await api.post('/api/reports/share', { month, email: share.email, message: share.message });
      setShareOpen(false);
      push(`Report for ${monthLabel(month)} is on its way to ${share.email}.`);
      setShare({ email: '', message: '' });
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSharing(false);
    }
  }

  /* ------------------------------- per-tab views ------------------------------ */

  const categoryRows = tab === 'category' ? readCategoryRows(data) : [];
  const trendRows = tab === 'trend' ? readTrendRows(data) : [];
  const dailyRows = tab === 'daily' ? readDailyRows(data) : [];
  const weekRows = tab === 'daily' ? readWeekRows(data) : [];

  const views = {
    category: {
      chart: (
        <ChartCard
          title="Spending by category"
          type="bar"
          data={{ labels: categoryRows.map((r) => r.name), datasets: [{ label: 'Amount', data: categoryRows.map((r) => r.amount) }] }}
          loading={!data}
          emptyText="No expenses in this month."
          table={{
            columns: ['Category', 'Amount', '% of total', 'vs last month'],
            rows: categoryRows.map((r) => [r.name, money(r.amount), `${r.pct}%`, r.changeText]),
          }}
        />
      ),
      table: {
        columns: ['Category', 'Amount', '% of total', 'vs last month'],
        rows: categoryRows.map((r) => [r.name, money(r.amount), `${r.pct}%`, r.changeText]),
      },
      empty: !data ? null : categoryRows.length === 0,
      emptyText: 'Nothing was logged in this month.',
    },
    trend: {
      chart: (
        <ChartCard
          title="Income vs expense (6 months)"
          type="bar"
          data={{
            labels: trendRows.map((r) => r.label),
            datasets: [
              { label: 'Income', data: trendRows.map((r) => r.income) },
              { label: 'Expense', data: trendRows.map((r) => r.expense) },
            ],
          }}
          loading={!data}
          emptyText="Six months of history will show up here."
          table={{
            columns: ['Month', 'Income', 'Expense'],
            rows: trendRows.map((r) => [r.label, money(r.income), money(r.expense)]),
          }}
        />
      ),
      table: {
        columns: ['Month', 'Income', 'Expense'],
        rows: trendRows.map((r) => [r.label, money(r.income), money(r.expense)]),
      },
      empty: !data ? null : trendRows.length === 0,
      emptyText: 'No months to compare yet.',
    },
    daily: {
      chart: (
        <ChartCard
          title={`Daily spending · ${monthLabel(month)}`}
          type="line"
          data={{
            labels: dailyRows.map((r) => String(r.day).padStart(2, '0')),
            datasets: [{ label: 'Spent', data: dailyRows.map((r) => r.amount), tension: 0.3, fill: true }],
          }}
          loading={!data}
          emptyText="No daily totals for this month."
          table={{
            columns: weekRows.length ? ['Week', 'Amount'] : ['Day', 'Amount'],
            rows: weekRows.length
              ? weekRows.map((w) => [w.label, money(w.amount)])
              : dailyRows.map((d) => [String(d.day).padStart(2, '0'), money(d.amount)]),
          }}
        />
      ),
      table: weekRows.length
        ? { columns: ['Week', 'Amount'], rows: weekRows.map((w) => [w.label, money(w.amount)]) }
        : { columns: ['Day', 'Amount'], rows: dailyRows.map((d) => [String(d.day).padStart(2, '0'), money(d.amount)]) },
      empty: !data ? null : dailyRows.length === 0 && weekRows.length === 0,
      emptyText: 'Nothing spent in this month.',
    },
  };

  const view = views[tab];

  return (
    <Page
      trail={[
        { label: 'Reports' },
        { label: monthLabel(month) },
      ]}
      title="Reports"
      subtitle="Three ways to read one month."
    >
      <div className="d-flex gap-2 flex-wrap align-items-center justify-content-between mb-3">
        <div className="d-flex gap-1 flex-wrap align-items-center" role="group" aria-label="Report view">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${tab === t.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="d-flex gap-1 flex-wrap align-items-center">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
            title="Previous month"
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
            aria-label="Next month"
            title="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap justify-content-end mb-3">
        <a className="btn btn-secondary btn-sm" href={`/api/reports/export/pdf?month=${month}`}>
          ⬇ Export PDF
        </a>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportImage} disabled={capturing}>
          {capturing && <span className="spinner" aria-hidden="true" />}
          {capturing ? 'Preparing…' : '⬇ Export image'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShareOpen(true)}>
          ✉ Email
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
          <h2 className="mb-0">{TABS.find((t) => t.id === tab)?.label}</h2>
          <span className="smallish muted num">{monthLabel(month)}</span>
        </div>

        {!data && !error && (
          <div className="card" role="status">
            <div className="d-flex align-items-center gap-2 muted">
              <span className="spinner" aria-hidden="true" />
              Building your report…
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
                <span>Same numbers, as a table</span>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <caption className="visually-hidden">Report table for {monthLabel(month)}</caption>
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
          title="Email this report"
          onClose={() => setShareOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShareOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="report-share-form" className="btn btn-primary" disabled={sharing}>
                {sharing && <span className="spinner" aria-hidden="true" />}
                {sharing ? 'Sending…' : 'Send'}
              </button>
            </>
          }
        >
          <form id="report-share-form" onSubmit={sendByEmail} noValidate>
            <FormField label="Send to" htmlFor="share-email" help={`The ${monthLabel(month)} report as an attachment.`}>
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
            <FormField label="Message (optional)" htmlFor="share-message">
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
