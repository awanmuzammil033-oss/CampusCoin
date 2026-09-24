/**
 * Budget progress bar (BUD-2). The percentage is in the label text as well
 * as the fill width, and the icon repeats the state — so the meaning never
 * depends on seeing colour.
 */
export default function Progress({ pct, label }) {
  const tone = pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok';
  const icon = tone === 'over' ? '⛔' : tone === 'near' ? '⚠' : '✔';
  const toneText = tone === 'over' ? 'over budget' : tone === 'near' ? 'nearly there' : 'on track';
  const width = Math.min(100, pct);

  return (
    <div>
      <div className="d-flex justify-content-between smallish mb-1">
        <span>
          {icon} {label}
        </span>
        <span className="num">
          {pct}% <span className="muted">({toneText})</span>
        </span>
      </div>
      <div
        className={`progress-track progress-${tone}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} — ${pct}% used, ${toneText}`}
      >
        <div className="progress-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
