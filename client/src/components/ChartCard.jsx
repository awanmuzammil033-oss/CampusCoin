import { useState, useEffect, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

import { money, currencySymbol } from '../money.js';
import { useLocale } from '../locale.jsx';
import { cssColor, withAlpha } from '../chartColors.js';

// Registering only what we draw keeps the bundle lean.
ChartJS.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const PALETTE = [
  'var(--cc-chart-1)', 'var(--cc-chart-2)', 'var(--cc-chart-3)', 'var(--cc-chart-4)',
  'var(--cc-chart-5)', 'var(--cc-chart-6)', 'var(--cc-chart-7)', 'var(--cc-chart-8)',
];

/**
 * Chart wrapper (design.md §5): title, skeleton while loading, the canvas,
 * and a "View as table" toggle — every chart has a text equivalent for
 * screen readers and anyone who prefers numbers over pictures.
 *
 * Colours arrive as `var(--cc-*)` tokens from the pages; canvas cannot
 * resolve those, so they are turned into the stylesheet's current values
 * at draw time and re-read whenever the theme flips.
 */
export default function ChartCard({ title, type = 'doughnut', data, options, loading, emptyText, table }) {
  const { t } = useLocale();
  const [showTable, setShowTable] = useState(false);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    if (!loading) setShowTable(false);
  }, [loading, data]);

  // Computed colours depend on [data-theme]; re-render when it changes so
  // a theme flip repaints the canvases instead of keeping stale colours.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const resolve = (value) => (Array.isArray(value) ? value.map(cssColor) : cssColor(value));

  const coloured = useMemo(() => {
    const datasets = (data?.datasets || []).map((ds, i) => {
      const series = cssColor(PALETTE[i % PALETTE.length]);
      const isLine = type === 'line';
      const defaultFill = !ds.backgroundColor;

      const backgroundColor = ds.backgroundColor
        ? resolve(ds.backgroundColor)
        : type === 'doughnut'
          ? (data?.labels || []).map((_, n) => cssColor(PALETTE[n % PALETTE.length]))
          : isLine
            ? withAlpha(series, 0.16)
            : series;

      const borderColor = ds.borderColor
        ? resolve(ds.borderColor)
        : type === 'doughnut'
          ? cssColor('var(--cc-surface)')
          : isLine
            ? series
            : 'transparent';

      return {
        ...ds,
        backgroundColor,
        borderColor,
        borderWidth: ds.borderWidth ?? (type === 'doughnut' ? 2 : isLine ? 2.5 : 0),
        // A line's fill is a wash under the stroke, never a solid slab.
        fill: ds.fill ?? (isLine && defaultFill ? true : ds.fill),
      };
    });
    return { ...data, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, type, themeTick]);

  const merged = useMemo(() => {
    const defaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 10, color: cssColor('var(--cc-text)') },
        },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label ? `${ctx.dataset.label}: ` : ''}${money(ctx.parsed.y ?? ctx.parsed)}` } },
      },
      scales: type === 'doughnut'
        ? undefined
        : {
            x: { ticks: { color: cssColor('var(--cc-muted)') } },
            y: {
              ticks: { callback: (v) => { const s = currencySymbol(); return s.length <= 1 ? `${s}${v}` : `${s} ${v}`; }, color: cssColor('var(--cc-muted)') },
              grid: { color: 'rgba(128,128,128,0.15)' },
            },
          },
    };
    return { ...defaults, ...options, plugins: { ...defaults.plugins, ...(options?.plugins || {}) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, options, themeTick]);
  const Chart = type === 'doughnut' ? Doughnut : type === 'line' ? Line : Bar;

  const hasData = Boolean(data?.labels?.length);

  return (
    <div className="card">
      <div className="card-title">
        <span>{title}</span>
        {hasData && table && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? t('ui.viewAsChart') : t('ui.viewAsTable')}
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

        {!loading && !hasData && <p className="muted">{emptyText || t('ui.nothingToChart')}</p>}

        {!loading && hasData && !showTable && (
          <div role="img" aria-label={t('ui.chartAria', { title })}>
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
