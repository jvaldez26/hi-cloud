import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

/**
 * Bug real que este hook existe para prevenir (ver su propio comentario de
 * cabecera): sin debounce, cada tecla en un buscador es un queryKey de React
 * Query distinto y por tanto un GET real — "FAC-001234" tecleado en el
 * panel de Facturas eran 10 peticiones, ráfaga que en producción llegó a
 * disparar el rate limit del backend (429) sin que nadie lo manejara.
 */
describe('useDebounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('no propaga el valor inmediatamente — sigue mostrando el anterior hasta que pasa el delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 400), { initialProps: { v: 'F' } });
    expect(result.current).toBe('F');

    rerender({ v: 'FA' });
    rerender({ v: 'FAC' });
    // Tres teclas en rápida sucesión, sin que pase el delay: el valor debounced
    // sigue siendo el inicial — esto es lo que evita el GET por cada tecla.
    expect(result.current).toBe('F');

    act(() => { vi.advanceTimersByTime(399); });
    expect(result.current).toBe('F');

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('FAC');
  });

  it('reinicia el temporizador con cada cambio — solo el último valor sobrevive', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 400), { initialProps: { v: '' } });

    rerender({ v: 'F' });
    act(() => { vi.advanceTimersByTime(300); }); // no llega a los 400ms
    rerender({ v: 'FA' });                        // reinicia el temporizador
    act(() => { vi.advanceTimersByTime(300); }); // tampoco llega — sigue sin propagar "F"
    expect(result.current).toBe('');

    act(() => { vi.advanceTimersByTime(100); }); // ahora sí, 400ms desde "FA"
    expect(result.current).toBe('FA');
  });

  it('vaciar el campo (string vacío) propaga YA — el usuario espera ver la lista completa al instante', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 400), { initialProps: { v: 'FAC' } });

    rerender({ v: '' });
    // Sin avanzar el reloj — debe reflejar el vacío de inmediato, no 400ms después.
    expect(result.current).toBe('');
  });

  it('funciona igual con números (montoMin/montoMax) — no es exclusivo de strings', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce<number | undefined>(v, 400), { initialProps: { v: undefined as number | undefined } });

    rerender({ v: 5 });
    expect(result.current).toBeUndefined();
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(5);
  });
});
