import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useLocale } from '../locale.jsx';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);

/** Small transient messages: success disappears on its own, errors stay
 *  until dismissed, and the region is polite for screen readers. */
export function ToastProvider({ children }) {
  const { t } = useLocale();
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
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind === 'error' ? 'toast-error' : ''}`}>
            <div className="d-flex align-items-start gap-2">
              <Icon name={toast.kind === 'error' ? 'warning' : 'checkCircle'} size={19} />
              <span>{toast.message}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm ms-auto"
                onClick={() => dismiss(toast.id)}
                aria-label={t('ui.dismiss')}
              >
                <Icon name="close" size={15} />
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
