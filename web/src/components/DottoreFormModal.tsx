import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { useConfirm } from './ConfirmDialog';
import { api, ApiError, type Dottore } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (d: Dottore) => void;
  dottore?: Dottore | null;
}

const initial = {
  nome: '',
  studio: '',
  telefono: '',
  email: '',
  indirizzo: '',
  partita_iva: '',
  codice_fiscale: '',
  note: '',
};

export function DottoreFormModal({ open, onClose, onSaved, dottore }: Props) {
  const isEdit = !!dottore;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (dottore) {
      setForm({
        nome: dottore.nome,
        studio: dottore.studio ?? '',
        telefono: dottore.telefono ?? '',
        email: dottore.email ?? '',
        indirizzo: ('indirizzo' in dottore ? (dottore as { indirizzo?: string }).indirizzo : '') ?? '',
        partita_iva: ('partita_iva' in dottore ? (dottore as { partita_iva?: string }).partita_iva : '') ?? '',
        codice_fiscale: ('codice_fiscale' in dottore ? (dottore as { codice_fiscale?: string }).codice_fiscale : '') ?? '',
        note: ('note' in dottore ? (dottore as { note?: string }).note : '') ?? '',
      });
    } else {
      setForm(initial);
    }
    setError(null);
  }, [dottore, open]);

  function close() {
    if (!isEdit) setForm(initial);
    setError(null);
    setSubmitting(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        studio: form.studio.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        indirizzo: form.indirizzo.trim() || null,
        partita_iva: form.partita_iva.trim() || null,
        codice_fiscale: form.codice_fiscale.trim() || null,
        note: form.note.trim() || null,
      };
      const saved = isEdit && dottore
        ? await api.patch<Dottore>(`/api/dottori/${dottore.id}`, payload)
        : await api.post<Dottore>('/api/dottori', payload);
      push(
        isEdit ? `Dottore "${saved.nome}" aggiornato` : `Dottore "${saved.nome}" creato`,
        'success',
      );
      onSaved(saved);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!dottore) return;
    const ok = await confirm({
      title: `Eliminare il dottore "${dottore.nome}"`,
      message: 'I lavori già associati a questo dottore restano nello storico.',
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/dottori/${dottore.id}`);
      push('Dottore eliminato', 'success');
      onSaved({ ...dottore });
      close();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? `Modifica dottore` : 'Nuovo dottore'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>Annulla</button>
          {isEdit && (
            <button type="button" className="btn-danger" onClick={() => void handleDelete()}>
              Elimina
            </button>
          )}
          <button
            type="submit"
            form="dottore-form"
            disabled={submitting || form.nome.trim().length === 0}
          >
            {submitting ? 'Salvataggio…' : isEdit ? 'Salva' : 'Crea'}
          </button>
        </>
      }
    >
      <form id="dottore-form" onSubmit={handleSubmit} className="form-grid form-grid--2">
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
          Studio
          <input
            value={form.studio}
            onChange={(e) => setForm({ ...form, studio: e.target.value })}
          />
        </label>
        <label>
          Telefono
          <input
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Indirizzo
          <input
            value={form.indirizzo}
            onChange={(e) => setForm({ ...form, indirizzo: e.target.value })}
          />
        </label>
        <label>
          Partita IVA
          <input
            value={form.partita_iva}
            onChange={(e) => setForm({ ...form, partita_iva: e.target.value })}
          />
        </label>
        <label>
          Codice fiscale
          <input
            value={form.codice_fiscale}
            onChange={(e) => setForm({ ...form, codice_fiscale: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Note
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
        {error && <div className="error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
      </form>
    </Modal>
  );
}
