import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/**
 * Avvia un timer di inattività: dopo `minutes` minuti senza eventi
 * tastiera/mouse/touch chiama `onTimeout`. Pensato per terminali condivisi
 * in laboratorio (la spec di Aplo's lo richiede esplicitamente).
 *
 * Disattivato se minutes <= 0 o se enabled è false.
 */
export function useInactivityLogout(
  minutes: number,
  enabled: boolean,
  onTimeout: () => void,
): void {
  const timerRef = useRef<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  // Manteniamo il callback aggiornato senza riavviare il timer ad ogni render.
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    const ms = minutes * 60_000;

    const reset = () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => onTimeoutRef.current(), ms);
    };
    reset();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [enabled, minutes]);
}
