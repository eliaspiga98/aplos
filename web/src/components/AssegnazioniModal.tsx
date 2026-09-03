import { useEffect, useMemo, useState } from 'react';
import {
  api, ApiError,
  type AssegnazioneLavoro, type Collaboratore,
  type FaseAssegnazione, type StatoAssegnazione, type StatoLavoro,
} from '../api';
import { FASE_ASSEGNAZIONE_LABEL, labelStatoLavoro } from '../utils/format';
import { Modal } from './Modal';
import { useToast } from './Toaster';

interface AssignmentDraft {
  key: string;
  id?: number;
  id_collaboratore: string;
  fase: FaseAssegnazione;
  mansione: string;
  stato_incarico: StatoAssegnazione;
}

interface Props {
  open: boolean;
  idLavoro: number;
  onClose: () => void;
  onSaved: (stato?: StatoLavoro) => void;
  targetState?: StatoLavoro;
  current?: AssegnazioneLavoro[];
}

let draftCounter = 0;

function phaseForState(state?: StatoLavoro): FaseAssegnazione {
  if (state === 'in_corso_cad') return 'cad';
  if (state === 'in_corso_rifinitura') return 'rifinitura';
  return 'altro';
}

function defaultRole(phase: FaseAssegnazione): string {
  if (phase === 'cad') return 'CAD';
  if (phase === 'rifinitura') return 'Rifinitura';
  return '';
}

function emptyRow(targetState?: StatoLavoro): AssignmentDraft {
  const fase = phaseForState(targetState);
  draftCounter += 1;
  return {
    key: `new-${draftCounter}`,
    id_collaboratore: '',
    fase,
    mansione: defaultRole(fase),
    stato_incarico: 'attivo',
  };
}

export function AssegnazioniModal({ open, idLavoro, onClose, onSaved, targetState, current = [] }: Props) {
  const [collaboratori, setCollaboratori] = useState<Collaboratore[]>([]);
  const [rows, setRows] = useState<AssignmentDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  const transition = targetState === 'in_corso_cad' || targetState === 'in_corso_rifinitura';
  const targetPhase = phaseForState(targetState);

  useEffect(() => {
    if (!open) return;
    api.get<Collaboratore[]>('/api/collaboratori?limit=500')
      .then(setCollaboratori)
      .catch(() => setCollaboratori([]));
    setRows(current.map((assignment) => ({
      key: `saved-${assignment.id}`,
      id: Number(assignment.id),
      id_collaboratore: String(assignment.id_collaboratore),
      fase: assignment.fase,
      mansione: assignment.mansione,
      stato_incarico: assignment.stato_incarico,
    })));
    setError(null);
  }, [open, current]);

  const activeForTarget = useMemo(
    () => rows.some((row) => row.fase === targetPhase && row.stato_incarico === 'attivo'),
    [rows, targetPhase],
  );

  function addRow() {
    setRows((value) => [...value, emptyRow(targetState)]);
  }

  function updateRow(key: string, patch: Partial<AssignmentDraft>) {
    setRows((value) => value.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const incomplete = rows.some((row) => !row.id_collaboratore || !row.mansione.trim());
    if (incomplete) {
      setError('Completa collaboratore e mansione oppure rimuovi la riga.');
      return;
    }
    const assignments = rows.map((row) => ({
      id: row.id,
      id_collaboratore: Number(row.id_collaboratore),
      fase: row.fase,
      mansione: row.mansione.trim(),
      stato_incarico: row.stato_incarico,
    }));
    setBusy(true);
    setError(null);
    try {
      if (targetState) {
        await api.post(`/api/lavori/${idLavoro}/stato`, {
          stato: targetState,
          assegnazioni: assignments,
        });
        push(assignments.length > 0 ? 'Fase e collaboratori aggiornati' : 'Fase aggiornata', 'success');
        onSaved(targetState);
      } else {
        await api.put(`/api/lavori/${idLavoro}/assegnazioni`, { assegnazioni: assignments });
        push('Collaboratori aggiornati', 'success');
        onSaved();
      }
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
      title={transition ? `Passa a ${labelStatoLavoro(targetState)}` : 'Collaboratori del lavoro'}
      size="lg"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
        <button type="submit" form="assegnazioni-form" disabled={busy}>
          {busy ? 'Salvataggio…' : transition ? `Conferma ${labelStatoLavoro(targetState)}` : 'Salva collaboratori'}
        </button>
      </>}
    >
      <form id="assegnazioni-form" onSubmit={submit} className="form-grid">
        {transition && <div className="assignment-transition-note">
          <strong>Collaboratore facoltativo</strong>
          <span>
            Puoi avviare questa fase senza assegnare nessuno e completare l’incarico in seguito.
            {activeForTarget ? ' È già presente un incarico attivo per questa fase.' : ''}
          </span>
        </div>}

        <div className="assignment-editor-list">
          {rows.map((row) => <div className={`assignment-editor-row assignment-editor-row--${row.stato_incarico}`} key={row.key}>
            <label>
              Collaboratore
              <select
                value={row.id_collaboratore}
                disabled={row.id != null}
                onChange={(e) => updateRow(row.key, { id_collaboratore: e.target.value })}
              >
                <option value="">— seleziona —</option>
                {collaboratori.map((collaboratore) => (
                  <option key={collaboratore.id} value={collaboratore.id}>{collaboratore.nome}</option>
                ))}
              </select>
            </label>
            <label>
              Fase
              <select
                value={row.fase}
                onChange={(e) => {
                  const fase = e.target.value as FaseAssegnazione;
                  updateRow(row.key, {
                    fase,
                    mansione: row.mansione === defaultRole(row.fase) ? defaultRole(fase) : row.mansione,
                  });
                }}
              >
                {(Object.keys(FASE_ASSEGNAZIONE_LABEL) as FaseAssegnazione[]).map((fase) => (
                  <option key={fase} value={fase}>{FASE_ASSEGNAZIONE_LABEL[fase]}</option>
                ))}
              </select>
            </label>
            <label>
              Mansione
              <input
                value={row.mansione}
                onChange={(e) => updateRow(row.key, { mansione: e.target.value })}
                placeholder="Es. progettazione, lucidatura"
              />
            </label>
            <div className="assignment-editor-actions">
              <span className={`assignment-status assignment-status--${row.stato_incarico}`}>
                {row.stato_incarico === 'attivo' ? 'Attivo' : 'Completato'}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => updateRow(row.key, {
                  stato_incarico: row.stato_incarico === 'attivo' ? 'completato' : 'attivo',
                })}
              >
                {row.stato_incarico === 'attivo' ? 'Segna finito' : 'Riattiva'}
              </button>
              <button
                type="button"
                className="btn-link btn-link--danger"
                onClick={() => setRows((value) => value.filter((item) => item.key !== row.key))}
              >
                Rimuovi
              </button>
            </div>
          </div>)}
        </div>

        <button type="button" className="btn-secondary assignment-add" onClick={addRow}>
          + Aggiungi collaboratore
        </button>
        {rows.length === 0 && <p className="muted">Nessun collaboratore associato. Puoi aggiungerlo ora o in seguito.</p>}
        {collaboratori.length === 0 && <p className="muted">Nessun collaboratore disponibile. Aggiungilo dalla sezione Collaboratori.</p>}
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
