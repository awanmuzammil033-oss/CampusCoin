import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

/** Small transient messages: success disappears on its own, errors stay
 *  until dismissed, and the region is polite for screen readers. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, kind = 'success') => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((list) => [...list, { id, message, kind }]);
      if (kind !== 'error') setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`}>
            <div className="d-flex align-items-start gap-2">
              <span aria-hidden="true">{t.kind === 'error' ? '⚠' : '✓'}</span>
              <span>{t.message}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm ms-auto"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss message"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
