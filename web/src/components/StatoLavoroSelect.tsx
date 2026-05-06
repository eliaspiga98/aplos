import { useState } from 'react';
import { api, type StatoLavoro } from '../api';

const STATI: { value: StatoLavoro; label: string }[] = [
  { value: 'in_attesa', label: 'In attesa' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'in_prova', label: 'In prova' },
  { value: 'finito', label: 'Finito' },
];

interface Props {
  idLavoro: number;
  stato: StatoLavoro;
  onChange: (next: StatoLavoro) => void;
}

export function StatoLavoroSelect({ idLavoro, stato, onChange }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleChange(next: StatoLavoro) {
    if (next === stato) return;
    setBusy(true);
    try {
      await api.post(`/api/lavori/${idLavoro}/stato`, { stato: next });
      onChange(next);
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
