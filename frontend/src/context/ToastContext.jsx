import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);
const TOAST_DURATION = 2600; // same timing as the original homepage

/** The homepage's single slide-up toast, shared by every page. */
export function ToastProvider({ children }) {
  const [state, setState] = useState({ show: false, message: '', type: 'success' });
  const timer = useRef(null);

  const toast = useCallback((message, tone = 'ok') => {
    clearTimeout(timer.current);
    const type = tone === 'bad' || tone === 'warn' || tone === 'error' ? 'error' : 'success';
    setState({ show: true, message, type });
    timer.current = setTimeout(() => setState((s) => ({ ...s, show: false })), type === 'error' ? 4200 : TOAST_DURATION);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={`toast ${state.show ? 'show' : ''} toast--${state.type}`} id="toast" role="status" aria-live="polite" aria-atomic="true">
        <span className="toast-ico" aria-hidden="true">{state.type === 'error' ? '!' : '✓'}</span>
        <span id="toastMsg">{state.message}</span>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}
