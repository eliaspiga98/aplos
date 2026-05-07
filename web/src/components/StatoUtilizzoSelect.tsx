import { useState } from 'react';
import { api, type StatoUtilizzo } from '../api';
import { STATO_UTILIZZO_LABEL } from '../utils/format';

const STATI: StatoUtilizzo[] = ['nuovo', 'parziale', 'esaurito'];

interface Props {
  idMateriale: number;
  stato: StatoUtilizzo;
  onChange: (next: StatoUtilizzo) => void;
}

export function StatoUtilizzoSelect({ idMateriale, stato, onChange }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleChange(next: StatoUtilizzo) {
    if (next === stato) return;
    setBusy(true);
    try {
      await api.patch(`/api/materiali/${idMateriale}`, { stato_utilizzo: next });
      onChange(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      className={`stato-select stato-select--${stato}`}
      value={stato}
      onChange={(e) => void handleChange(e.target.value as StatoUtilizzo)}
      disabled={busy}
    >
      {STATI.map((s) => <option key={s} value={s}>{STATO_UTILIZZO_LABEL[s]}</option>)}
    </select>
  );
}
