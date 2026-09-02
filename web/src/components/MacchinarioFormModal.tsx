import { useEffect, useState } from 'react';
import { api, ApiError, type Macchinario } from '../api';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (machine: Macchinario) => void;
  machine?: Macchinario | null;
}

const initial = { nome: '', marca: '', modello: '', matricola: '', ubicazione: '', note: '' };

export function MacchinarioFormModal({ open, onClose, onSaved, machine }: Props) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setForm(machine ? {
      nome: machine.nome, marca: machine.marca ?? '', modello: machine.modello ?? '',
      matricola: machine.matricola ?? '', ubicazione: machine.ubicazione ?? '', note: machine.note ?? '',
    } : initial);
    setError(null);
  }, [machine, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]));
    payload.nome = form.nome.trim();
    try {
      const saved = machine
        ? await api.patch<Macchinario>(`/api/macchinari/${machine.id}`, payload)
        : await api.post<Macchinario>('/api/macchinari', payload);
      onSaved(saved); onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally { setBusy(false); }
  }

  return <Modal open={open} onClose={onClose} title={machine ? 'Modifica macchinario' : 'Nuovo macchinario'} footer={<>
    <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
    <button type="submit" form="macchinario-form" disabled={busy || !form.nome.trim()}>{busy ? 'Salvataggio…' : 'Salva'}</button>
  </>}>
    <form id="macchinario-form" onSubmit={submit} className="form-grid form-grid--2">
      <label>Nome*<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus required /></label>
      <label>Ubicazione<input value={form.ubicazione} onChange={(e) => setForm({ ...form, ubicazione: e.target.value })} /></label>
      <label>Marca<input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></label>
      <label>Modello<input value={form.modello} onChange={(e) => setForm({ ...form, modello: e.target.value })} /></label>
      <label>Matricola<input value={form.matricola} onChange={(e) => setForm({ ...form, matricola: e.target.value })} /></label>
      <label style={{ gridColumn: '1 / -1' }}>Note<textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      {error && <div className="error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
    </form>
  </Modal>;
}
