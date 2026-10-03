import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { message } from 'antd';
import { xlinkMenuItem } from './xlinkMenuItem';
import type { EstadoXlinkItem } from '../../api/xlink.api';

const xlinkApiMock = vi.hoisted(() => ({ publicar: vi.fn() }));
vi.mock('../../api/xlink.api', () => ({ xlinkApi: xlinkApiMock }));

describe('xlinkMenuItem', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('no elegible: queda disabled y el label (tooltip) explica el motivo — nunca oculto sin explicación', async () => {
    const estado: EstadoXlinkItem = { id: 1, yaEnviado: false, elegible: false, motivo: 'La orden debe estar en estado Enviada' };
    const item: any = xlinkMenuItem('orden_compra', 1, estado, vi.fn());

    expect(item.disabled).toBe(true);
    render(<>{item.label}</>);

    const texto = screen.getByText('Enviar por HiCloud Xlink');
    await userEvent.hover(texto);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('La orden debe estar en estado Enviada');
  });

  it('ya enviado: queda disabled y el label indica el estado del receptor', () => {
    const estado: EstadoXlinkItem = { id: 2, yaEnviado: true, estadoReceptor: 'procesado', elegible: false };
    const item: any = xlinkMenuItem('factura_credito', 2, estado, vi.fn());
    expect(item.disabled).toBe(true);
  });

  it('elegible: habilitado y, al hacer clic, publica y avisa a onEnviando', async () => {
    xlinkApiMock.publicar.mockResolvedValue([{ id: 3, ok: true }]);
    const estado: EstadoXlinkItem = { id: 3, yaEnviado: false, elegible: true };
    const onEnviando = vi.fn();
    const item: any = xlinkMenuItem('nota_credito', 3, estado, onEnviando);

    expect(item.disabled).toBe(false);
    item.onClick();

    await waitFor(() => expect(onEnviando).toHaveBeenCalledTimes(1));
    expect(xlinkApiMock.publicar).toHaveBeenCalledWith('nota_credito', [3]);
  });

  it('click sin ser elegible (fallback de antd que no dispara el tooltip del Dropdown): avisa el motivo en vez de intentar enviar', () => {
    const warnSpy = vi.spyOn(message, 'warning');
    const estado: EstadoXlinkItem = { id: 4, yaEnviado: false, elegible: false, motivo: 'Falta el término de pago' };
    const item: any = xlinkMenuItem('orden_compra', 4, estado, vi.fn());

    item.onClick();

    expect(warnSpy).toHaveBeenCalledWith('Falta el término de pago');
    expect(xlinkApiMock.publicar).not.toHaveBeenCalled();
  });
});
