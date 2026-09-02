import { useEffect, useState } from 'react';
import { api, ApiError, type ManutenzioneProgrammata } from '../api';
import { addDaysDateInput } from '../utils/format';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  idMacchinario: number;
  onClose: () => void;
  onSaved: () => void;
  maintenance?: ManutenzioneProgrammata | null;
}

const makeInitial = () => ({ titolo: '', descrizione: '', prossima_scadenza: addDaysDateInput(30), preavviso_giorni: '7', recurring: false, ricorrenza_valore: '1', ricorrenza_unita: 'mesi' as 'giorni' | 'mesi' | 'anni', attiva: true });

export function ManutenzioneFormModal({ open, idMacchinario, onClose, onSaved, maintenance }: Props) {
  const [form, setForm] = useState(makeInitial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setForm(maintenance ? {
      titolo: maintenance.titolo, descrizione: maintenance.descrizione ?? '', prossima_scadenza: maintenance.prossima_scadenza,
      preavviso_giorni: String(maintenance.preavviso_giorni), recurring: maintenance.ricorrenza_valore != null,
      ricorrenza_valore: String(maintenance.ricorrenza_valore ?? 1), ricorrenza_unita: maintenance.ricorrenza_unita ?? 'mesi', attiva: maintenance.attiva,
    } : makeInitial());
    setError(null);
  }, [maintenance, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const payload = {
      titolo: form.titolo.trim(), descrizione: form.descrizione.trim() || null,
      prossima_scadenza: form.prossima_scadenza, preavviso_giorni: Number(form.preavviso_giorni),
      ricorrenza_valore: form.recurring ? Number(form.ricorrenza_valore) : null,
      ricorrenza_unita: form.recurring ? form.ricorrenza_unita : null, attiva: form.attiva,
    };
    try {
      if (maintenance) await api.patch(`/api/macchinari/manutenzioni/${maintenance.id}`, payload);
      else await api.post(`/api/macchinari/${idMacchinario}/manutenzioni`, payload);
      onSaved(); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Errore'); }
    finally { setBusy(false); }
  }

  return <Modal open={open} onClose={onClose} title={maintenance ? 'Modifica manutenzione' : 'Programma manutenzione'} footer={<>
    <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
    <button type="submit" form="manutenzione-form" disabled={busy || !form.titolo.trim()}>{busy ? 'Salvataggio…' : 'Salva'}</button>
  </>}>
    <form id="manutenzione-form" onSubmit={submit} className="form-grid form-grid--2">
      <label style={{ gridColumn: '1 / -1' }}>Titolo*<input value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} autoFocus required /></label>
      <label>Prossima scadenza<input type="date" value={form.prossima_scadenza} onChange={(e) => setForm({ ...form, prossima_scadenza: e.target.value })} required /></label>
      <label>Preavviso (giorni)<input type="number" min="0" max="365" value={form.preavviso_giorni} onChange={(e) => setForm({ ...form, preavviso_giorni: e.target.value })} required /></label>
      <label className="checkbox-row" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /><span>Manutenzione ricorrente</span></label>
      {form.recurring && <>
        <label>Ogni<input type="number" min="1" value={form.ricorrenza_valore} onChange={(e) => setForm({ ...form, ricorrenza_valore: e.target.value })} /></label>
        <label>Unità<select value={form.ricorrenza_unita} onChange={(e) => setForm({ ...form, ricorrenza_unita: e.target.value as typeof form.ricorrenza_unita })}><option value="giorni">giorni</option><option value="mesi">mesi</option><option value="anni">anni</option></select></label>
      </>}
      <label className="checkbox-row" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={form.attiva} onChange={(e) => setForm({ ...form, attiva: e.target.checked })} /><span>Programmazione attiva</span></label>
      <label style={{ gridColumn: '1 / -1' }}>Descrizione<textarea rows={3} value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} /></label>
      {error && <div className="error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
    </form>
  </Modal>;
}
