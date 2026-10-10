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
    const onCerrar = vi.fn().mockResolvedValue(undefined);
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
    const onCerrar = vi.fn().mockResolvedValue(undefined);
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
    const onCerrar = vi.fn().mockResolvedValue(undefined);
    render(<CierreCajaFormulario cajaHoy={CAJA_HOY} onCerrar={onCerrar} />);

    fireEvent.change(screen.getByLabelText('Billete de 500'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

    await screen.findByRole('button', { name: 'Volver a revisar' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a revisar' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Volver a revisar' })).not.toBeInTheDocument());
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('en modo ciego no muestra el Desglose de Operaciones (el vendedor no ve el esperado de su caja abierta)', () => {
    render(<CierreCajaFormulario cajaHoy={{ ...CAJA_HOY, ciegoCajaActivo: true }} onCerrar={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.queryByText('Desglose de Operaciones')).not.toBeInTheDocument();
    expect(screen.getByText(/Modo ciego activo/)).toBeInTheDocument();
  });

  // Requisito explícito (2026-10-10): política "Cierre de caja con
  // descuadre" en Modo Supervisor. El backend responde 428 cuando el
  // supervisor YA probó su identidad (eso lo resolvió el interceptor
  // genérico, fuera de este componente) pero falta que vea la tabla y
  // escriba el motivo — esto NUNCA lo ve la cajera, solo aparece después.
  describe('autorización de descuadre (428 requiereMotivoDescuadre)', () => {
    const CAJA_SIN_CEROS = { ...CAJA_HOY, ventasTarjeta: 0 };

    /** Llena todas las formas para que handleCerrar no abra el Modal.confirm de "formas en 0". */
    function declararTodasLasFormas() {
      fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '1500' } });
      fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '100' } });
      fireEvent.change(screen.getByLabelText('Transferencia'), { target: { value: '50' } });
      fireEvent.change(screen.getByLabelText('Cheque'), { target: { value: '25' } });
    }

    function error428() {
      return {
        response: {
          status: 428,
          data: {
            requiereMotivoDescuadre: true,
            cuadrePorFormaPago: [
              { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
              { forma: 'tarjeta', esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
            ],
            neto: -0.06,
            supervisorToken: 'tok-abc123',
          },
        },
      };
    }

    it('muestra la tabla por forma de pago y pide el motivo — nunca se la mostró a la cajera antes', async () => {
      const onCerrar = vi.fn().mockRejectedValue(error428());
      render(<CierreCajaFormulario cajaHoy={CAJA_SIN_CEROS} onCerrar={onCerrar} />);

      declararTodasLasFormas();
      fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

      await screen.findByText('Autorización de descuadre');
      expect(screen.getAllByText(/829\.94/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/830\.00/).length).toBeGreaterThan(0);
      // el botón de confirmar existe y arranca deshabilitado sin motivo
      const confirmar = screen.getByRole('button', { name: 'Autorizar y cerrar' });
      expect(confirmar).toBeDisabled();
    });

    it('con el motivo escrito, reenvía el MISMO payload con motivoDescuadre y el supervisorToken ya validado', async () => {
      const onCerrar = vi.fn()
        .mockRejectedValueOnce(error428())
        .mockResolvedValueOnce(undefined);
      render(<CierreCajaFormulario cajaHoy={CAJA_SIN_CEROS} onCerrar={onCerrar} />);

      declararTodasLasFormas();
      fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

      await screen.findByText('Autorización de descuadre');
      fireEvent.change(screen.getByPlaceholderText(/Verificado con el cajero/), {
        target: { value: 'El faltante de tarjeta es real, error del datáfono' },
      });
      const confirmar = screen.getByRole('button', { name: 'Autorizar y cerrar' });
      expect(confirmar).not.toBeDisabled();
      fireEvent.click(confirmar);

      await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(2));
      const [payloadSegundo, opts] = onCerrar.mock.calls[1];
      expect(payloadSegundo.saldoFisico).toBe(1500); // el mismo payload del primer intento
      expect(opts).toEqual({
        motivoDescuadre: 'El faltante de tarjeta es real, error del datáfono',
        supervisorToken: 'tok-abc123',
      });
      await waitFor(() => expect(screen.queryByText('Autorización de descuadre')).not.toBeInTheDocument());
    });

    it('cancelar el modal de autorización NO cierra la caja', async () => {
      const onCerrar = vi.fn().mockRejectedValue(error428());
      render(<CierreCajaFormulario cajaHoy={CAJA_SIN_CEROS} onCerrar={onCerrar} />);

      declararTodasLasFormas();
      fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

      await screen.findByText('Autorización de descuadre');
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByText('Autorización de descuadre')).not.toBeInTheDocument());
      expect(onCerrar).toHaveBeenCalledTimes(1); // solo el intento original, nunca un segundo envío
    });
  });
});
