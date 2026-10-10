import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CierreCajaFormulario, type CierreCajaPayload } from './CierreCajaFormulario';

// Mismo componente para el POS y para Caja Diaria — ver el incidente
// 2026-10-09/10 (Bellamar González / Beatriz Riva) que llevó a unificarlos.
// Estos tests son el contrato: cerrar desde cualquiera de los dos módulos
// debe producir exactamente el mismo payload para la misma declaración.

const CAJA_HOY = {
  id: 55,
  estado: 'abierta',
  ciegoCajaActivo: false,
  saldoApertura: 500,
  ventasEfectivo: 1000,
  ventasTarjeta: 2000,
  ventasTransferencia: 0,
  ventasCredito: 0,
  cobrosRecibidos: 0,
  totalAnticipos: 0,
  gastosEfectivo: 0,
};

describe('CierreCajaFormulario', () => {
  it('declara las 4 formas y manda el mismo payload sin importar quién monte el componente (POS o Caja Diaria)', async () => {
    const onCerrar = vi.fn();
    render(<CierreCajaFormulario cajaHoy={CAJA_HOY} onCerrar={onCerrar} />);

    fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Billete de 500'), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

    // tarjeta>0 y efectivo>0 (vía billetes), transferencia/otros en 0 →
    // la confirmación aparece SOLO para esas dos formas vacías.
    await screen.findByRole('button', { name: 'Sí, confirmar y cerrar' });
    expect(screen.getByText(/Transferencia, Cheque \/ Depósito \/ Otro \/ Documentos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, confirmar y cerrar' }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    const payload: CierreCajaPayload = onCerrar.mock.calls[0][0];

    expect(payload.saldoFisico).toBe(1500);
    expect(payload.desgloseBilletes).toEqual({ 500: 3 });
    expect(payload.declaradoPorForma).toEqual([
      { forma: 'efectivo', monto: 1500 },
      { forma: 'tarjeta', monto: 2000 },
      { forma: 'transferencia', monto: 0, confirmado: true },
      { forma: 'otros', monto: 0, confirmado: true },
    ]);
  });

  it('no pide confirmación cuando las 4 formas tienen monto declarado', async () => {
    const onCerrar = vi.fn();
    render(<CierreCajaFormulario cajaHoy={CAJA_HOY} onCerrar={onCerrar} />);

    fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Transferencia'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Cheque'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Sí, confirmar y cerrar' })).not.toBeInTheDocument();
    const payload: CierreCajaPayload = onCerrar.mock.calls[0][0];
    expect(payload.declaradoPorForma).toEqual([
      { forma: 'efectivo', monto: 1500 },
      { forma: 'tarjeta', monto: 2000 },
      { forma: 'transferencia', monto: 100 },
      { forma: 'otros', monto: 50 },
    ]);
  });

  it('cancelar la confirmación no llama a onCerrar — permite completar el formulario', async () => {
    const onCerrar = vi.fn();
    render(<CierreCajaFormulario cajaHoy={CAJA_HOY} onCerrar={onCerrar} />);

    fireEvent.change(screen.getByLabelText('Billete de 500'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

    await screen.findByRole('button', { name: 'Volver a revisar' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a revisar' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Volver a revisar' })).not.toBeInTheDocument());
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('en modo ciego no muestra el Desglose de Operaciones (el vendedor no ve el esperado de su caja abierta)', () => {
    render(<CierreCajaFormulario cajaHoy={{ ...CAJA_HOY, ciegoCajaActivo: true }} onCerrar={vi.fn()} />);
    expect(screen.queryByText('Desglose de Operaciones')).not.toBeInTheDocument();
    expect(screen.getByText(/Modo ciego activo/)).toBeInTheDocument();
  });
});
