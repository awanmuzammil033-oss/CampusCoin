/**
 * Progress bar (BUD-2) with two readings:
 *
 *  - budget (default): spending against a limit. Red "over budget" only
 *    when the limit is genuinely passed; everything still inside the
 *    limit is the yellow "under budget" line — out is never shown when
 *    it is not out.
 *  - goal: a savings goal, where saving MORE than planned is good news.
 *    It never turns red or says "over budget"; the percentage always
 *    tells the truth (100% = reached, less = still working toward it).
 *
 * The icon and the words repeat the state, so meaning never depends on
 * seeing colour (design.md §3).
 */
export default function Progress({ pct, label, variant = 'budget' }) {
  const parsed = Number(pct);
  const value = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  const width = Math.min(100, value);

  const goal = variant === 'goal';
  const reached = goal && value >= 100;
  const over = !goal && value >= 100;

  const tone = over ? 'over' : 'ok';
  const icon = goal ? (reached ? '✔' : '⏳') : over ? '⛔' : '✔';
  const toneText = goal
    ? reached
      ? 'under budget'
      : 'under goal'
    : over
      ? 'over budget'
      : 'under budget';

  return (
    <div>
      <div className="d-flex justify-content-between smallish mb-1">
        <span>
          {icon} {label}
        </span>
        <span className="num">
          {value}% <span className="muted">({toneText})</span>
        </span>
      </div>
      <div
        className={`progress-track progress-${tone}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} — ${value}% ${toneText}`}
      >
        <div className="progress-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
