import { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

import { money } from '../money.js';

// Registering only what we draw keeps the bundle lean.
ChartJS.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

/**
 * Chart wrapper (design.md §5): title, skeleton while loading, the canvas,
 * and a "View as table" toggle — every chart has a text equivalent for
 * screen readers and anyone who prefers numbers over pictures.
 */
export default function ChartCard({ title, type = 'doughnut', data, options, loading, emptyText, table }) {
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!loading) setShowTable(false);
  }, [loading, data]);

  const palette = [
    'var(--cc-chart-1)', 'var(--cc-chart-2)', 'var(--cc-chart-3)', 'var(--cc-chart-4)',
    'var(--cc-chart-5)', 'var(--cc-chart-6)', 'var(--cc-chart-7)', 'var(--cc-chart-8)',
  ];

  const coloured = {
    ...data,
    datasets: (data?.datasets || []).map((ds, i) => ({
      ...ds,
      backgroundColor: ds.backgroundColor || (type === 'doughnut'
        ? data.labels.map((_, n) => palette[n % palette.length])
        : palette[i % palette.length]),
      borderColor: ds.borderColor || 'var(--cc-surface)',
      borderWidth: ds.borderWidth ?? (type === 'doughnut' ? 2 : 0),
    })),
  };

  const defaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: type === 'doughnut' ? 'bottom' : 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label ? `${ctx.dataset.label}: ` : ''}${money(ctx.parsed.y ?? ctx.parsed)}` } },
    },
    scales: type === 'doughnut'
      ? undefined
      : { y: { ticks: { callback: (v) => `$${v}` }, grid: { color: 'rgba(128,128,128,0.15)' } } },
  };

  const merged = { ...defaults, ...options, plugins: { ...defaults.plugins, ...(options?.plugins || {}) } };
  const Chart = type === 'doughnut' ? Doughnut : type === 'line' ? Line : Bar;

  const hasData = Boolean(data?.labels?.length);

  return (
    <div className="card">
      <div className="card-title">
        <span>{title}</span>
        {hasData && table && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'View as chart' : 'View as table'}
          </button>
        )}
      </div>

      <div className="chart-box">
        {loading && (
          <div className="chart-skeleton" aria-hidden="true">
            <div className="skeleton" style={{ height: 16, width: '40%' }} />
            <div className="skeleton" style={{ height: 180 }} />
          </div>
        )}

        {!loading && !hasData && <p className="muted">{emptyText || 'Nothing to chart yet.'}</p>}

        {!loading && hasData && !showTable && (
          <div role="img" aria-label={`${title} chart. A table with the same numbers is available.`}>
            <Chart data={coloured} options={merged} height={260} />
          </div>
        )}

        {!loading && hasData && showTable && table && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={j > 0 ? 'num' : undefined}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
