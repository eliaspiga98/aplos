import { useState } from 'react';
import { VITA_SHADE_GROUPS } from '../domain/vitaShades';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function VitaShadePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const isLegacy = value && !VITA_SHADE_GROUPS.some((group) => (group.values as readonly string[]).includes(value));

  return <div className="vita-picker">
    <button type="button" className="vita-picker-trigger" onClick={() => setOpen((current) => !current)}>
      <span>{value || '— nessun colore —'}</span>
      <span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
    {isLegacy && <div className="muted vita-legacy">Valore storico: seleziona un colore VITA per sostituirlo.</div>}
    {open && <div className="vita-palette" role="listbox" aria-label="Scala colori VITA">
      <button type="button" className={`vita-chip ${value === '' ? 'vita-chip--selected' : ''}`} onClick={() => { onChange(''); setOpen(false); }}>Nessuno</button>
      {VITA_SHADE_GROUPS.map((group) => <div className="vita-group" key={group.label}>
        <div className="vita-group-label">{group.label}</div>
        <div className="vita-group-values">
          {group.values.map((shade) => <button
            type="button"
            role="option"
            aria-selected={value === shade}
            className={`vita-chip vita-chip--${group.label.toLowerCase()} ${value === shade ? 'vita-chip--selected' : ''}`}
            key={shade}
            onClick={() => { onChange(shade); setOpen(false); }}
          >{shade}</button>)}
        </div>
      </div>)}
    </div>}
  </div>;
}
