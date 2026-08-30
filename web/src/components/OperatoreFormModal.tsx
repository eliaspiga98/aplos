import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { useConfirm } from './ConfirmDialog';
import { api, ApiError, type Operatore } from '../api';
import { RUOLO_LABEL } from '../utils/format';
import { useAuth } from '../auth';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  operatore?: Operatore | null;
}

const initial = {
  nome: '',
  ruolo: 'tecnico' as 'admin' | 'tecnico',
  pin: '',
  usa_demo: false,
};

export function OperatoreFormModal({ open, onClose, onSaved, operatore }: Props) {
  const isEdit = !!operatore;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isCurrentUser = operatore?.id === user?.id;

  useEffect(() => {
    if (operatore) {
      setForm({
        nome: operatore.nome,
        ruolo: operatore.ruolo,
        pin: '',
        usa_demo: operatore.usa_demo,
      });
    } else {
      setForm(initial);
    }
    setError(null);
  }, [operatore, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isEdit && operatore) {
        const payload: Record<string, unknown> = {
          nome: form.nome.trim(),
          ruolo: form.ruolo,
          usa_demo: form.usa_demo,
        };
        if (form.pin) payload.pin = form.pin;
        await api.patch<Operatore>(`/api/operatori/${operatore.id}`, payload);
        push(`Operatore "${form.nome}" aggiornato`, 'success');
      } else {
        if (!form.pin || form.pin.length < 4) {
          setError('Il PIN deve avere almeno 4 cifre');
          setBusy(false);
          return;
        }
        await api.post<Operatore>('/api/operatori', {
          nome: form.nome.trim(),
          ruolo: form.ruolo,
          pin: form.pin,
          usa_demo: form.usa_demo,
        });
        push(`Operatore "${form.nome}" creato`, 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!operatore) return;
    const ok = await confirm({
      title: `Eliminare l'operatore "${operatore.nome}"`,
      message: 'L\'operatore non potrà più accedere. I record creati restano nello storico.',
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/operatori/${operatore.id}`);
      push('Operatore eliminato', 'success');
      onSaved();
      onClose();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifica operatore' : 'Nuovo operatore'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
          {isEdit && !isCurrentUser && (
            <button type="button" className="btn-danger" onClick={() => void handleDelete()}>
              Elimina
            </button>
          )}
          <button type="submit" form="operatore-form" disabled={busy || form.nome.trim().length === 0}>
            {busy ? 'Salvataggio…' : isEdit ? 'Salva' : 'Crea'}
          </button>
        </>
      }
    >
      <form id="operatore-form" onSubmit={submit} className="form-grid">
        <label>
          Nome*
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            autoFocus
            required
          />
        </label>
        <label>
          Ruolo
          <select
            value={form.ruolo}
            onChange={(e) => setForm({ ...form, ruolo: e.target.value as 'admin' | 'tecnico' })}
          >
            <option value="tecnico">{RUOLO_LABEL.tecnico}</option>
            <option value="admin">{RUOLO_LABEL.admin}</option>
          </select>
        </label>
        <label>
          {isEdit ? 'Nuovo PIN (lasciare vuoto per non cambiare)' : 'PIN*'}
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            minLength={isEdit ? 0 : 4}
            maxLength={12}
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            required={!isEdit}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.usa_demo}
            onChange={(e) => setForm({ ...form, usa_demo: e.target.checked })}
          />
          <div>
            <strong>Account demo</strong>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              Questo operatore vedrà il database di prova, separato da quello di
              produzione. Utile per fornire una demo a un cliente senza
              esporre dati reali.
            </div>
          </div>
        </label>
        {isCurrentUser && (
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            Non puoi eliminare l'account con cui hai effettuato l'accesso.
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
