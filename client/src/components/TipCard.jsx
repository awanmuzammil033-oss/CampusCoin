import { money } from '../money.js';
import { useLocale } from '../locale.jsx';

/**
 * Saving tip card (TIP-2/3): one sentence, the estimated saving, and the
 * three decisions the student owns — pin, bookmark (with a note), dismiss.
 * Pinned tips get the gold edge so they stand out in the list.
 */
export default function TipCard({ tip, onAction, busy }) {
  const { t } = useLocale();
  const pinned = tip.status === 'pinned';

  return (
    <div className={`card tip-card ${pinned ? 'is-pinned' : ''}`}>
      <div className="d-flex align-items-start gap-2">
        <span aria-hidden="true" title={t('ui.savingTip')}>💡</span>
        <div className="flex-grow-1">
          <p className="mb-2">{tip.text}</p>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {tip.potentialSavings > 0 && (
              <span className="tip-saving">{t('ui.saveApprox', { amount: money(tip.potentialSavings) })}</span>
            )}
            {tip.isBookmarked && <span className="pill">🔖 {t('ui.saved')}</span>}
          </div>
        </div>
        <div className="d-flex gap-1">
          <button
            type="button"
            className="icon-btn"
            aria-pressed={pinned}
            title={pinned ? t('tip.unpin') : t('tip.pin')}
            aria-label={pinned ? t('tip.unpin') : t('tip.pin')}
            disabled={busy}
            onClick={() => onAction(pinned ? 'unpin' : 'pin')}
          >
            📌
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-pressed={Boolean(tip.isBookmarked)}
            title={tip.isBookmarked ? t('tip.removeBookmark') : t('tip.bookmarkNote')}
            aria-label={tip.isBookmarked ? t('tip.removeBookmark') : t('tip.bookmark')}
            disabled={busy}
            onClick={() => onAction('bookmark')}
          >
            🔖
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t('tip.dismissMonth')}
            aria-label={t('tip.dismissMonth')}
            disabled={busy}
            onClick={() => onAction('dismiss')}
          >
            ✕
          </button>
        </div>
      </div>
      {tip.note && (
        <p className="smallish muted mb-0 mt-2">
          <span aria-hidden="true">📝</span> {tip.note}
        </p>
      )}
    </div>
  );
}
