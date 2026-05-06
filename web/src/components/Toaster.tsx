import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (text: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, tone: ToastTone = 'success') => {
    const id = ++counter;
    setToasts((curr) => [...curr, { id, text, tone }]);
    // auto-dismiss dopo 3.5s
    window.setTimeout(() => {
      setToasts((curr) => curr.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve stare dentro ToasterProvider');
  return ctx;
}

// Helper per usi non-React (es. fuori da componenti). Resta `null` finché
// ToasterProvider non si è montato.
let externalPush: ((text: string, tone?: ToastTone) => void) | null = null;
export function ToasterBridge() {
  const { push } = useToast();
  useEffect(() => {
    externalPush = push;
    return () => { externalPush = null; };
  }, [push]);
  return null;
}
export function toast(text: string, tone: ToastTone = 'success') {
  externalPush?.(text, tone);
}
