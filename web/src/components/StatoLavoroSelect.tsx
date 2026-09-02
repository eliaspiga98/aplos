import { useState } from 'react';
import { api, type AssegnazioneLavoro, type StatoLavoro } from '../api';
import { STATO_LAVORO_LABEL } from '../utils/format';
import { AssegnazioniModal } from './AssegnazioniModal';

const STATI: { value: StatoLavoro; label: string }[] = (
  ['in_attesa', 'in_corso', 'in_prova', 'finito'] as StatoLavoro[]
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

  async function handleChange(next: StatoLavoro) {
    if (next === stato) return;
    if (next === 'in_corso') {
      setPending(next);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/lavori/${idLavoro}/stato`, { stato: next });
      onChange(next);
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
