import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  function close(value: boolean) {
    if (pending) pending.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={pending != null}
        onClose={() => close(false)}
        title={pending?.opts.title ?? ''}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => close(false)}>
              {pending?.opts.cancelText ?? 'Annulla'}
            </button>
            <button
              type="button"
              className={pending?.opts.danger ? 'btn-danger' : ''}
              onClick={() => close(true)}
              autoFocus
            >
              {pending?.opts.confirmText ?? 'Conferma'}
            </button>
          </>
        }
      >
        {pending?.opts.message && <p>{pending.opts.message}</p>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm deve stare dentro ConfirmProvider');
  return ctx.confirm;
}
