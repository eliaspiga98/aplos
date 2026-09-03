import { useState } from 'react';
import { api, ApiError, type AssegnazioneLavoro, type StatoLavoro } from '../api';
import { STATO_LAVORO_LABEL } from '../utils/format';
import { AssegnazioniModal } from './AssegnazioniModal';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toaster';

const STATI: { value: StatoLavoro; label: string }[] = (
  [
    'in_attesa', 'in_corso_cad', 'attesa_rifinitura',
    'in_corso_rifinitura', 'in_prova', 'finito',
  ] as StatoLavoro[]
).map((value) => ({ value, label: STATO_LAVORO_LABEL[value]! }));

interface Props {
  idLavoro: number;
  stato: StatoLavoro;
  assegnazioni?: AssegnazioneLavoro[];
  onChange: (next: StatoLavoro) => void;
}

export function StatoLavoroSelect({ idLavoro, stato, assegnazioni = [], onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<StatoLavoro | null>(null);
  const confirm = useConfirm();
  const { push } = useToast();

  async function handleChange(next: StatoLavoro) {
    if (next === stato) return;
    if (next === 'in_corso_cad' || next === 'in_corso_rifinitura') {
      setPending(next);
      return;
    }
    if (next === 'finito') {
      const ok = await confirm({
        title: 'Confermare il completamento?',
        message: 'Il lavoro verrà spostato in Finito e tutti gli incarichi ancora attivi saranno completati.',
        confirmText: 'Sì, è finito',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.post(`/api/lavori/${idLavoro}/stato`, { stato: next });
      onChange(next);
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <select
      className={`stato-select stato-select--${stato}`}
      value={stato}
      onChange={(e) => void handleChange(e.target.value as StatoLavoro)}
      onClick={(e) => e.stopPropagation()}
      disabled={busy}
    >
      {STATI.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
    <AssegnazioniModal
      open={pending != null}
      idLavoro={idLavoro}
      targetState={pending ?? undefined}
      current={assegnazioni}
      onClose={() => setPending(null)}
      onSaved={(next) => { if (next) onChange(next); }}
    />
  </>;
}
