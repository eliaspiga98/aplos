import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { api, ApiError, type Deposito } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (d: Deposito) => void;
  deposito?: Deposito | null;
}

const initial = { nome: '', descrizione: '' };

export function DepositoFormModal({ open, onClose, onSaved, deposito }: Props) {
  const isEdit = !!deposito;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (deposito) {
      setForm({ nome: deposito.nome, descrizione: deposito.descrizione ?? '' });
    } else {
      setForm(initial);
    }
    setError(null);
  }, [deposito, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        nome: form.nome.trim(),
        descrizione: form.descrizione.trim() || null,
      };
      const saved = isEdit && deposito
        ? await api.patch<Deposito>(`/api/depositi/${deposito.id}`, payload)
        : await api.post<Deposito>('/api/depositi', payload);
      push(isEdit ? `Deposito "${saved.nome}" aggiornato` : `Deposito "${saved.nome}" creato`, 'success');
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifica deposito` : 'Nuovo deposito'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
          <button type="submit" form="deposito-form" disabled={busy || form.nome.trim().length === 0}>
            {busy ? 'Salvataggio…' : isEdit ? 'Salva' : 'Crea'}
          </button>
        </>
      }
    >
      <form id="deposito-form" onSubmit={submit} className="form-grid">
        <label>
          Nome*
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="es. Armadio 1, Scaffale B, Frigo materiali"
            autoFocus
            required
          />
        </label>
        <label>
          Descrizione
          <textarea
            rows={3}
            value={form.descrizione}
            onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
            placeholder="Eventuali note sulla collocazione fisica"
          />
        </label>
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
