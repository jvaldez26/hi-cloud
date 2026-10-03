import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EnviarPorXlinkButton from './EnviarPorXlinkButton';
import type { EstadoXlinkItem } from '../../api/xlink.api';

const xlinkApiMock = vi.hoisted(() => ({ estado: vi.fn(), publicar: vi.fn() }));
vi.mock('../../api/xlink.api', () => ({ xlinkApi: xlinkApiMock }));

function montar(estado: EstadoXlinkItem, onEnviado = vi.fn()) {
  xlinkApiMock.estado.mockResolvedValue([estado]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EnviarPorXlinkButton tipoDocumento="factura_credito" documentoId={estado.id} onEnviado={onEnviado} />
    </QueryClientProvider>,
  );
  return { onEnviado };
}

describe('EnviarPorXlinkButton', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ya enviado: botón deshabilitado y el tooltip da el estado y el número generado', async () => {
    montar({ id: 1, yaEnviado: true, estadoReceptor: 'procesado', numeroGenerado: 'FAC-999', elegible: false });

    const boton = await screen.findByRole('button', { name: /Ya enviado/ });
    expect(boton).toBeDisabled();

    await userEvent.hover(boton);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('procesado');
    expect(tooltip).toHaveTextContent('FAC-999');
  });

  it('no elegible: botón deshabilitado y el tooltip explica el motivo concreto — nunca oculto sin explicación', async () => {
    montar({ id: 2, yaEnviado: false, elegible: false, motivo: 'El e-CF debe estar aceptado por DGII' });

    // El botón de "cargando" (antes de que resuelva /xlink/estado) tiene el
    // MISMO texto accesible "Enviar por HiCloud Xlink" que el de "no
    // elegible" — un findByRole simple puede resolver sobre ese primero y
    // quedarse con un nodo ya desmontado. Se espera a que sea el de verdad:
    // el que SÍ está envuelto en el <span> que lleva el Tooltip.
    let envoltura: Element | null = null;
    await waitFor(() => {
      const boton = screen.getByRole('button', { name: /Enviar por HiCloud Xlink/ });
      envoltura = boton.closest('span');
      expect(envoltura).not.toBeNull();
    });
    expect(screen.getByRole('button', { name: /Enviar por HiCloud Xlink/ })).toBeDisabled();

    await userEvent.hover(envoltura!);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('El e-CF debe estar aceptado por DGII');
  });

  it('elegible: botón habilitado, al hacer clic publica y avisa a onEnviado', async () => {
    xlinkApiMock.publicar.mockResolvedValue([{ id: 3, ok: true }]);
    const { onEnviado } = montar({ id: 3, yaEnviado: false, elegible: true });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enviar por HiCloud Xlink/ })).not.toBeDisabled();
    });
    const boton = screen.getByRole('button', { name: /Enviar por HiCloud Xlink/ });

    await userEvent.click(boton);

    await waitFor(() => expect(onEnviado).toHaveBeenCalledTimes(1));
    expect(xlinkApiMock.publicar).toHaveBeenCalledWith('factura_credito', [3]);
  });

  it('mientras carga el estado, el botón se ve deshabilitado (nunca habilitado por defecto)', () => {
    xlinkApiMock.estado.mockReturnValue(new Promise(() => {})); // nunca resuelve
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EnviarPorXlinkButton tipoDocumento="orden_compra" documentoId={9} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: /Enviar por HiCloud Xlink/ })).toBeDisabled();
  });
});
