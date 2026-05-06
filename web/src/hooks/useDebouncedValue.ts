import { useEffect, useState } from 'react';

/**
 * Ritorna `value` ritardato di `delay` ms, riavviando il timer ad ogni
 * cambio. Tipico uso: ricerca testuale che non vogliamo far partire ad
 * ogni keystroke ma solo quando l'utente smette di digitare per X ms.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
