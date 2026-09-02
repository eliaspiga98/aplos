import { useEffect, useMemo, useState } from 'react';

import {
  api,
  type Materiale,
  type MaterialUsageInput,
  type StatoPrelievoMateriale,
} from '../api';
import { labelCategoria } from '../utils/format';

interface Props {
  onAdd: (usage: MaterialUsageInput, material: Materiale) => void | Promise<void>;
  reserved?: MaterialUsageInput[];
  buttonLabel?: string;
  disabled?: boolean;
}

interface StockOption {
  key: string;
  material: Materiale;
  stato: StatoPrelievoMateriale;
  disponibile: number;
}

function quantityLabel(value: number, unit: string | null): string {
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`;
}

function materialLabel(material: Materiale): string {
  return [
    labelCategoria(material.categoria),
    material.marca,
    material.colore,
    `lotto ${material.lotto}`,
  ].filter(Boolean).join(' · ');
}

export function MaterialUsagePicker({
  onAdd,
  reserved = [],
  buttonLabel = 'Aggiungi materiale',
  disabled = false,
}: Props) {
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [deposito, setDeposito] = useState('');
  const [selection, setSelection] = useState('');
  const [quantita, setQuantita] = useState('1');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<Materiale[]>('/api/materiali?limit=500')
      .then(setMateriali)
      .catch(() => setError('Impossibile caricare i materiali disponibili'))
      .finally(() => setLoading(false));
  }, []);

  const reservedNew = useMemo(() => {
    const totals = new Map<number, number>();
    for (const item of reserved) {
      if (item.stato_prelievo !== 'nuovo') continue;
      totals.set(item.id_materiale, (totals.get(item.id_materiale) ?? 0) + item.quantita_usata);
    }
    return totals;
  }, [reserved]);

  const stockOptions = useMemo<StockOption[]>(() => {
    const options: StockOption[] = [];
    for (const material of materiali) {
      const nuova = Math.max(0, Number(material.quantita) - (reservedNew.get(material.id) ?? 0));
      const parziale = Number(material.quantita_parziale);
      if (nuova > 0) {
        options.push({
          key: `${material.id}:nuovo`,
          material,
          stato: 'nuovo',
          disponibile: nuova,
        });
      }
      if (parziale > 0) {
        options.push({
          key: `${material.id}:parziale`,
          material,
          stato: 'parziale',
          disponibile: parziale,
        });
      }
    }
    return options;
  }, [materiali, reservedNew]);

  const depositi = useMemo(() => {
    const values = new Map<string, string>();
    for (const option of stockOptions) {
      const key = option.material.id_deposito == null ? 'none' : String(option.material.id_deposito);
      values.set(key, option.material.deposito_nome ?? 'Senza deposito');
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'));
  }, [stockOptions]);

  const optionsForDeposit = stockOptions.filter((option) => {
    const key = option.material.id_deposito == null ? 'none' : String(option.material.id_deposito);
    return key === deposito;
  });
  const selected = stockOptions.find((option) => option.key === selection) ?? null;

  async function add() {
    if (!selected) return;
    const amount = Number(quantita);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('La quantità deve essere maggiore di zero');
      return;
    }
    if (amount > selected.disponibile) {
      setError(`Disponibilità insufficiente: ${quantityLabel(selected.disponibile, selected.material.unita_misura)}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onAdd({
        id_materiale: selected.material.id,
        stato_prelievo: selected.stato,
        quantita_usata: amount,
        note: note.trim() || undefined,
      }, selected.material);
      setSelection('');
      setQuantita('1');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile aggiungere il materiale');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="material-usage-picker">
      <div className="form-grid form-grid--2">
        <label>
          Deposito*
          <select
            value={deposito}
            onChange={(event) => {
              setDeposito(event.target.value);
              setSelection('');
              setError(null);
            }}
            disabled={disabled || loading}
          >
            <option value="">— seleziona deposito —</option>
            {depositi.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>

        <label>
          Materiale disponibile*
          <select
            value={selection}
            onChange={(event) => {
              const value = event.target.value;
              setSelection(value);
              const option = stockOptions.find((item) => item.key === value);
              setQuantita(option ? String(Math.min(1, option.disponibile)) : '1');
              setError(null);
            }}
            disabled={disabled || loading || !deposito}
          >
            <option value="">— seleziona materiale —</option>
            {optionsForDeposit.map((option) => (
              <option key={option.key} value={option.key}>
                {option.stato === 'nuovo' ? 'Nuovo' : 'Parziale'} · {materialLabel(option.material)} · {quantityLabel(option.disponibile, option.material.unita_misura)}
              </option>
            ))}
          </select>
          {deposito && optionsForDeposit.length === 0 && (
            <span className="muted">Nessun materiale disponibile in questo deposito.</span>
          )}
        </label>

        <label>
          Quantità utilizzata*
          <input
            type="number"
            min="0.001"
            step="0.001"
            max={selected?.disponibile}
            value={quantita}
            onChange={(event) => setQuantita(event.target.value)}
            disabled={disabled || !selected}
          />
          {selected && (
            <span className="muted">
              Disponibili: {quantityLabel(selected.disponibile, selected.material.unita_misura)}
            </span>
          )}
        </label>

        <label>
          Note
          <input
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            disabled={disabled || !selected}
            placeholder="Facoltative"
          />
        </label>
      </div>

      {selected?.stato === 'nuovo' && (
        <p className="material-usage-hint">
          Al salvataggio la quantità scelta passerà automaticamente da nuova a parziale.
        </p>
      )}
      {selected?.stato === 'parziale' && (
        <p className="material-usage-hint">
          Il materiale è già parziale e resterà disponibile per altri lavori.
        </p>
      )}
      {error && <div className="error">{error}</div>}
      <div className="inline-form-actions">
        <button type="button" onClick={() => void add()} disabled={disabled || busy || !selected}>
          {busy ? 'Salvataggio…' : buttonLabel}
        </button>
      </div>
    </div>
  );
}
