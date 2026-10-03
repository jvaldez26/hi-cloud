import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { message } from 'antd';
import { useXlinkEnvioMasivo } from './useXlinkEnvioMasivo';
import type { EstadoXlinkItem } from '../../api/xlink.api';

const xlinkApiMock = vi.hoisted(() => ({ publicar: vi.fn() }));
vi.mock('../../api/xlink.api', () => ({ xlinkApi: xlinkApiMock }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function estados(...items: EstadoXlinkItem[]) {
  return new Map(items.map(e => [e.id, e]));
}

describe('useXlinkEnvioMasivo', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('puedeSeleccionar: solo lo elegible y no enviado — no lo ya enviado, no lo sin motivo válido', () => {
    const { result } = renderHook(() => useXlinkEnvioMasivo('orden_compra'), { wrapper });
    const mapa = estados(
      { id: 1, yaEnviado: false, elegible: true },
      { id: 2, yaEnviado: true, elegible: false, estadoReceptor: 'procesado' },
      { id: 3, yaEnviado: false, elegible: false, motivo: 'Falta el término de pago' },
    );

    expect(result.current.puedeSeleccionar(1, mapa)).toBe(true);
    expect(result.current.puedeSeleccionar(2, mapa)).toBe(false);
    expect(result.current.puedeSeleccionar(3, mapa)).toBe(false);
    expect(result.current.puedeSeleccionar(99, mapa)).toBe(false); // ni siquiera en el mapa
  });

  it('enviarSeleccionados: publica el lote seleccionado y, al terminar, limpia la selección', async () => {
    xlinkApiMock.publicar.mockResolvedValue([{ id: 1, ok: true }, { id: 2, ok: true }]);
    const { result } = renderHook(() => useXlinkEnvioMasivo('factura_credito'), { wrapper });

    act(() => result.current.setSeleccionados([1, 2]));
    expect(result.current.seleccionados).toEqual([1, 2]);

    act(() => result.current.enviarSeleccionados());

    await waitFor(() => expect(result.current.seleccionados).toEqual([]));
    expect(xlinkApiMock.publicar).toHaveBeenCalledWith('factura_credito', [1, 2]);
  });

  it('con resultados mixtos, avisa cuántos salieron bien y cuántos con problemas', async () => {
    xlinkApiMock.publicar.mockResolvedValue([{ id: 1, ok: true }, { id: 2, ok: false, error: 'No cuadra' }]);
    const successSpy = vi.spyOn(message, 'success');
    const warnSpy = vi.spyOn(message, 'warning');
    const { result } = renderHook(() => useXlinkEnvioMasivo('nota_credito'), { wrapper });

    act(() => result.current.setSeleccionados([1, 2]));
    act(() => result.current.enviarSeleccionados());

    await waitFor(() => expect(successSpy).toHaveBeenCalledWith('1 documento(s) enviado(s) correctamente'));
    expect(warnSpy).toHaveBeenCalledWith('1 documento(s) con problemas');
  });
});
