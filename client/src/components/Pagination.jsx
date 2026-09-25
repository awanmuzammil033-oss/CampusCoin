import { useLocale } from '../locale.jsx';

/** Pager for list views (TXN-5). Buttons stay 44px for touch. */
export default function Pagination({ page, pages, onPage }) {
  const { t } = useLocale();
  if (pages <= 1) return null;

  return (
    <nav className="pagination" aria-label={t('ui.pagination')}>
      <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      {range(page, pages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="muted px-1" aria-hidden="true">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={`page-btn ${p === page ? 'current' : ''}`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        )
      )}
      <button type="button" className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </nav>
  );
}

/** Compact window: first, last, and a few around the current page. */
function range(page, pages) {
  const out = [];
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}
