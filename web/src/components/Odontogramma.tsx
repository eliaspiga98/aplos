import { useMemo, useState } from 'react';

export type TipoStruttura = 'corona_singola' | 'ponte';

export interface Struttura {
  tipo_struttura: TipoStruttura;
  elementi_dentali: number[];
}

interface Props {
  value: Struttura[];
  onChange: (next: Struttura[]) => void;
}

// Layout di riga visto dall'osservatore (specchio del paziente):
// fila superiore Q1 invertito + Q2; fila inferiore Q4 invertito + Q3.
const ROW_TOP_LEFT = [18, 17, 16, 15, 14, 13, 12, 11];
const ROW_TOP_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const ROW_BOT_LEFT = [48, 47, 46, 45, 44, 43, 42, 41];
const ROW_BOT_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

export function Odontogramma({ value, onChange }: Props) {
  const [selected, setSelected] = useState<number[]>([]);

  // Mappa: numero dente -> indice della struttura che lo contiene (se esiste).
  const toothToStructIdx = useMemo(() => {
    const m = new Map<number, number>();
    value.forEach((s, idx) => {
      for (const t of s.elementi_dentali) m.set(t, idx);
    });
    return m;
  }, [value]);

  function toggleTooth(n: number) {
    if (toothToStructIdx.has(n)) {
      // dente già in una struttura: rimuovi quella struttura
      const idx = toothToStructIdx.get(n)!;
      onChange(value.filter((_, i) => i !== idx));
      return;
    }
    setSelected((curr) =>
      curr.includes(n) ? curr.filter((x) => x !== n) : [...curr, n],
    );
  }

  function addAsCoronaSingola() {
    if (selected.length === 0) return;
    const nuove: Struttura[] = selected.map((n) => ({
      tipo_struttura: 'corona_singola',
      elementi_dentali: [n],
    }));
    onChange([...value, ...nuove]);
    setSelected([]);
  }

  function addAsPonte() {
    if (selected.length < 2) return;
    const ordered = [...selected].sort((a, b) => a - b);
    onChange([...value, { tipo_struttura: 'ponte', elementi_dentali: ordered }]);
    setSelected([]);
  }

  function clearSelection() {
    setSelected([]);
  }

  function classForTooth(n: number): string {
    const classes = ['tooth'];
    if (selected.includes(n)) classes.push('tooth--selected');
    const sIdx = toothToStructIdx.get(n);
    if (sIdx != null) {
      const s = value[sIdx]!;
      classes.push(s.tipo_struttura === 'ponte' ? 'tooth--ponte' : 'tooth--corona');
    }
    return classes.join(' ');
  }

  function renderRow(numbers: number[]) {
    return (
      <div className="tooth-row">
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            className={classForTooth(n)}
            onClick={() => toggleTooth(n)}
            title={
              toothToStructIdx.has(n)
                ? 'Click per rimuovere la struttura'
                : 'Click per selezionare'
            }
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="odontogramma">
      <div className="odontogramma-grid">
        <div className="odontogramma-half">
          {renderRow(ROW_TOP_LEFT)}
          {renderRow(ROW_BOT_LEFT)}
        </div>
        <div className="odontogramma-divider" />
        <div className="odontogramma-half">
          {renderRow(ROW_TOP_RIGHT)}
          {renderRow(ROW_BOT_RIGHT)}
        </div>
      </div>

      <div className="odontogramma-actions">
        <div className="muted">
          {selected.length === 0
            ? 'Clicca i denti su cui agire'
            : `Selezionati: ${selected.sort((a, b) => a - b).join(', ')}`}
        </div>
        <div className="odontogramma-buttons">
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={addAsCoronaSingola}
          >
            Corone singole
          </button>
          <button type="button" disabled={selected.length < 2} onClick={addAsPonte}>
            Crea ponte
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={selected.length === 0}
            onClick={clearSelection}
          >
            Annulla
          </button>
        </div>
      </div>

      {value.length > 0 && (
        <ul className="strutture-list">
          {value.map((s, i) => (
            <li key={i}>
              <span className={`pill pill--${s.tipo_struttura}`}>
                {s.tipo_struttura === 'ponte' ? 'Ponte' : 'Corona'}
              </span>
              <span>{s.elementi_dentali.join(' – ')}</span>
              <button
                type="button"
                className="btn-link"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
