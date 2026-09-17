import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider');
  return context;
}

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, tone = 'ok') => {
    const id = ++counter;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
  }, [dismiss]);

  const value = useMemo(() => ({
    success: (m) => push(m, 'ok'),
    error: (m) => push(typeof m === 'string' ? m : m?.message || 'Ocurrió un error', 'error'),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`panel sev-edge flex items-start gap-2 p-3 shadow-raise ${
              toast.tone === 'error' ? 'border-l-sev-critical' : 'border-l-sev-ok'
            }`}
          >
            {toast.tone === 'error'
              ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-sev-critical" />
              : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sev-ok" />}
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-ink-3 hover:text-ink"
              aria-label="Cerrar aviso"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
