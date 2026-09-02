import { useEffect, useState } from 'react';
import { api, ApiError, type AssegnazioneLavoro, type Collaboratore, type StatoLavoro } from '../api';
import { Modal } from './Modal';
import { useToast } from './Toaster';

interface AssignmentDraft {
  id_collaboratore: string;
  mansione: string;
}

interface Props {
  open: boolean;
  idLavoro: number;
  onClose: () => void;
  onSaved: (stato?: StatoLavoro) => void;
  targetState?: StatoLavoro;
  current?: AssegnazioneLavoro[];
}

const emptyRow = (): AssignmentDraft => ({ id_collaboratore: '', mansione: '' });

export function AssegnazioniModal({ open, idLavoro, onClose, onSaved, targetState, current = [] }: Props) {
  const [collaboratori, setCollaboratori] = useState<Collaboratore[]>([]);
  const [rows, setRows] = useState<AssignmentDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    api.get<Collaboratore[]>('/api/collaboratori?limit=500')
      .then(setCollaboratori)
      .catch(() => setCollaboratori([]));
    const active = current.filter((a) => !a.rimosso_at);
    setRows(active.map((a) => ({
      id_collaboratore: String(a.id_collaboratore),
      mansione: a.mansione,
    })));
    setError(null);
  }, [open, current]);

  function addRow() {
    setRows((value) => [...value, emptyRow()]);
  }

  function updateRow(index: number, patch: Partial<AssignmentDraft>) {
    setRows((value) => value.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const incomplete = rows.some((row) => !row.id_collaboratore || !row.mansione.trim());
    if (incomplete) {
      setError('Completa collaboratore e mansione oppure rimuovi la riga');
      return;
    }
    const assignments = rows.map((row) => ({
      id_collaboratore: Number(row.id_collaboratore),
      mansione: row.mansione.trim(),
    }));
    setBusy(true);
    setError(null);
    try {
      if (targetState) {
        await api.post(`/api/lavori/${idLavoro}/stato`, {
          stato: targetState,
          assegnazioni: assignments,
        });
        push(assignments.length > 0 ? 'Stato e assegnazioni aggiornati' : 'Stato aggiornato', 'success');
        onSaved(targetState);
      } else {
        await api.put(`/api/lavori/${idLavoro}/assegnazioni`, { assegnazioni: assignments });
        push('Assegnazioni aggiornate', 'success');
        onSaved();
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  const transition = targetState === 'in_corso';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transition ? 'Avvia lavoro e assegna collaboratori' : 'Collaboratori assegnati'}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
        <button type="submit" form="assegnazioni-form" disabled={busy}>
          {busy ? 'Salvataggio…' : transition ? 'Sposta in corso' : 'Salva assegnazioni'}
        </button>
      </>}
    >
      <form id="assegnazioni-form" onSubmit={submit} className="form-grid">
        {transition && <p className="muted">
          L’assegnazione è facoltativa: puoi spostare subito il lavoro e aggiungere i collaboratori in seguito.
        </p>}
        {rows.map((row, index) => <div className="assignment-row" key={index}>
          <select value={row.id_collaboratore} onChange={(e) => updateRow(index, { id_collaboratore: e.target.value })}>
            <option value="">— collaboratore —</option>
            {collaboratori.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input value={row.mansione} onChange={(e) => updateRow(index, { mansione: e.target.value })} placeholder="Mansione, es. CAD" list="mansioni-suggerite" />
          <button type="button" className="btn-secondary" onClick={() => setRows((value) => value.filter((_, i) => i !== index))}>Rimuovi</button>
        </div>)}
        <datalist id="mansioni-suggerite"><option value="CAD" /><option value="Rifinitura" /></datalist>
        <button type="button" className="btn-secondary" onClick={addRow}>+ Aggiungi collaboratore</button>
        {collaboratori.length === 0 && <p className="muted">Nessun collaboratore disponibile. Puoi aggiungerlo dalla sezione Collaboratori.</p>}
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
