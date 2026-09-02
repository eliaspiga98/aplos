import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { api, ApiError, type Collaboratore } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (collaboratore: Collaboratore) => void;
  collaboratore?: Collaboratore | null;
}

const initial = { nome: '', telefono: '', email: '', mansioni: '', note: '' };

export function CollaboratoreFormModal({ open, onClose, onSaved, collaboratore }: Props) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    setForm(collaboratore ? {
      nome: collaboratore.nome,
      telefono: collaboratore.telefono ?? '',
      email: collaboratore.email ?? '',
      mansioni: collaboratore.mansioni ?? '',
      note: collaboratore.note ?? '',
    } : initial);
    setError(null);
  }, [collaboratore, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        nome: form.nome.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        mansioni: form.mansioni.trim() || null,
        note: form.note.trim() || null,
      };
      const saved = collaboratore
        ? await api.patch<Collaboratore>(`/api/collaboratori/${collaboratore.id}`, payload)
        : await api.post<Collaboratore>('/api/collaboratori', payload);
      push(collaboratore ? 'Collaboratore aggiornato' : 'Collaboratore creato', 'success');
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
      title={collaboratore ? 'Modifica collaboratore' : 'Nuovo collaboratore'}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
        <button type="submit" form="collaboratore-form" disabled={busy || !form.nome.trim()}>
          {busy ? 'Salvataggio…' : collaboratore ? 'Salva' : 'Crea'}
        </button>
      </>}
    >
      <form id="collaboratore-form" onSubmit={submit} className="form-grid form-grid--2">
        <label>Nome*<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus required /></label>
        <label>Mansioni abituali<input value={form.mansioni} onChange={(e) => setForm({ ...form, mansioni: e.target.value })} placeholder="es. CAD, rifinitura" /></label>
        <label>Telefono<input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label style={{ gridColumn: '1 / -1' }}>Note<textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        {error && <div className="error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
      </form>
    </Modal>
  );
}
