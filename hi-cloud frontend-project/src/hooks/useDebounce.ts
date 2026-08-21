import { useState, useEffect } from 'react';

/**
 * Devuelve `valor` retrasado `delayMs`. Mientras el usuario sigue tecleando, el
 * valor devuelto no cambia; se actualiza cuando para.
 *
 * Uso previsto: el input se mantiene controlado por el estado INMEDIATO (para
 * que responda a cada tecla) y es el valor DEBOUNCED el que entra en la
 * queryKey de React Query o en un filtrado caro:
 *
 *     const [busq, setBusq] = useState('');
 *     const busqD = useDebounce(busq, 300);
 *     useQuery({ queryKey: ['algo', busqD], ... });
 *     <input value={busq} onChange={e => setBusq(e.target.value)} />
 *
 * Sin esto, cada tecla generaba una queryKey nueva y por tanto un request HTTP:
 * escribir "FAC-001234" en el panel de facturas eran 10 peticiones, cada una
 * con su ILIKE '%...%' y su COUNT(*) sobre la misma tabla.
 *
 * NO tiene nada que ver con el escáner de códigos de barras: ese camino no pasa
 * por ningún input controlado. handleGlobalKeyDown acumula las teclas en un ref
 * (sin re-render), reconoce la ráfaga por timing y llama a procesarScan, que
 * resuelve por match exacto contra el catálogo en memoria. Cero red, cero espera.
 */
export function useDebounce<T>(valor: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    // Vaciar el buscador debe surtir efecto YA: el usuario espera ver la lista
    // completa en cuanto pulsa la "✕", no 300 ms después.
    if (typeof valor === 'string' && valor === '') {
      setDebounced(valor);
      return;
    }
    const t = setTimeout(() => setDebounced(valor), delayMs);
    return () => clearTimeout(t);
  }, [valor, delayMs]);

  return debounced;
}

export default useDebounce;
