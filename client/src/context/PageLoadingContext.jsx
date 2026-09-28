import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const PageLoadingContext = createContext({
  isLoading: false,
  setPageLoading: () => {},
});

export function PageLoadingProvider({ children }) {
  const { pathname } = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const currentPathRef = useRef(pathname);
  const safetyTimerRef = useRef(null);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  // When pathname changes (user navigated to a different page)
  useEffect(() => {
    if (currentPathRef.current !== pathname) {
      currentPathRef.current = pathname;

      // Public landing page and auth modal routes should NEVER be covered by transition loader
      const isPublicRoute = pathname === '/' || pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';

      if (!isPublicRoute) {
        // Immediately show loader BEFORE content arrives
        setIsLoading(true);

        // Safety timeout: if page takes longer than 2.5s (or offline/airplane mode),
        // automatically release the loader so user is never stuck
        clearSafetyTimer();
        safetyTimerRef.current = setTimeout(() => {
          setIsLoading(false);
        }, 2500);
      } else {
        setIsLoading(false);
      }
    }
    return () => clearSafetyTimer();
  }, [pathname, clearSafetyTimer]);

  const setPageLoading = useCallback((loading) => {
    if (!loading) {
      clearSafetyTimer();
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [clearSafetyTimer]);

  return (
    <PageLoadingContext.Provider value={{ isLoading, setPageLoading }}>
      {children}
    </PageLoadingContext.Provider>
  );
}

export function usePageLoading() {
  return useContext(PageLoadingContext);
}
