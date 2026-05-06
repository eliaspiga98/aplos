interface Props {
  total: number;
  offset: number;
  limit: number;
  onChange: (nextOffset: number) => void;
}

/**
 * Paginatore essenziale: "N–M di T" + Precedente / Successivo.
 * Si nasconde se total <= limit (cioè cape in una sola pagina).
 */
export function Pager({ total, offset, limit, onChange }: Props) {
  if (total <= limit) {
    return total > 0 ? (
      <div className="pager">
        <span className="muted">{total} {total === 1 ? 'risultato' : 'risultati'}</span>
      </div>
    ) : null;
  }
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="pager">
      <span className="muted">{from}–{to} di {total}</span>
      <div className="pager-buttons">
        <button
          type="button"
          className="btn-secondary"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          ‹ Precedente
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
        >
          Successivo ›
        </button>
      </div>
    </div>
  );
}
