import { useEffect, useRef } from 'react';
import { useLocale } from '../locale.jsx';

/**
 * Modal (design.md §5): focus moves in on open, Tab stays inside,
 * Escape closes, and focus returns to whatever opened it. Used for
 * delete confirmations and the quick-add sheet.
 */
export default function Modal({ title, onClose, children, footer, labelledBy }) {
  const { t } = useLocale();
  const panelRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const first = panelRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (first || panelRef.current)?.focus();

    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') trapFocus(e);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  function trapFocus(e) {
    const focusables = panelRef.current.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'modal-title'}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 id="modal-title" className="mb-0">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('ui.closeDialog')}>✕</button>
        </div>
        {children}
        {footer && <div className="d-flex gap-2 justify-content-end mt-4">{footer}</div>}
      </div>
    </div>
  );
}
