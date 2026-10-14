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
    expect(screen.getByText(/Transferencia \/ Cheque \/ Depósito, Otro \/ Documentos/)).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Otro'), { target: { value: '25' } });

    fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Sí, confirmar y cerrar' })).not.toBeInTheDocument();
    const payload: CierreCajaPayload = onCerrar.mock.calls[0][0];
    // Cheque entra al bucket "transferencia" (DGII tipo 2, igual que
    // ventasTransferencia en el backend) — NO a "otros", que compara contra
    // ventas a crédito y nunca tendría con qué cuadrar un cheque real.
    expect(payload.declaradoPorForma).toEqual([
      { forma: 'efectivo', monto: 1500 },
      { forma: 'tarjeta', monto: 2000 },
      { forma: 'transferencia', monto: 150 },
      { forma: 'otros', monto: 25 },
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

  // Requisito explícito (2026-10-11): un turno con efectivo, tarjeta Y
  // transferencia debe mostrar cada forma en su propio renglón del Desglose
  // de Operaciones — antes tarjeta+transferencia salían sumadas en un solo
  // "Vendido Tarj./Trans.", sin con qué comparar cada campo del Desglose de
  // Pago (que ya las pedía por separado).
  it('el Desglose de Operaciones muestra efectivo, tarjeta y transferencia en renglones separados, no combinados', () => {
    const valorDe = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? '';
    render(<CierreCajaFormulario
      cajaHoy={{ ...CAJA_HOY, ventasEfectivo: 1000, ventasTarjeta: 2000, ventasTransferencia: 300 }}
      onCerrar={vi.fn().mockResolvedValue(undefined)}
    />);

    expect(screen.queryByText('Vendido Contado')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendido Tarj./Trans.')).not.toBeInTheDocument();
    expect(valorDe('Vendido en Efectivo')).toMatch(/1,000\.00/);
    expect(valorDe('Vendido Tarjeta')).toMatch(/2,000\.00/);
    expect(valorDe('Vendido Transferencia')).toMatch(/300\.00/);
  });

  // Incidente real (empresa 73, caja #788, 2026-10-12): Beatriz Riva intentó
  // cerrar la caja de Franchesca Sosa 6 veces seguidas, siempre con el mismo
  // 400 "Debes indicar un motivo para cerrar la caja de otro cajero" — el
  // formulario no avisaba de antemano. `esMiCaja` lo calcula el backend con
  // la MISMA lógica que valida el cierre (ver caja.service.ts).
  describe('esMiCaja === false — cerrando la caja de otro cajero', () => {
    const CAJA_AJENA = { ...CAJA_HOY, vendedorNombre: 'Franchesca Sosa', esMiCaja: false };

    it('muestra el aviso con el nombre del cajero desde el inicio', () => {
      render(<CierreCajaFormulario cajaHoy={CAJA_AJENA} onCerrar={vi.fn().mockResolvedValue(undefined)} />);
      expect(screen.getByText(/Estás cerrando la caja de Franchesca Sosa/)).toBeInTheDocument();
    });

    it('el botón Grabar arranca deshabilitado sin motivo — nunca llega a mandar la petición que daría 400', () => {
      render(<CierreCajaFormulario cajaHoy={CAJA_AJENA} onCerrar={vi.fn().mockResolvedValue(undefined)} />);
      expect(screen.getByRole('button', { name: 'Grabar' })).toBeDisabled();
    });

    // Bug real (2026-10-14, cajero Samuel, con modo supervisor activo): el
    // texto escrito aquí se mandaba como `notas`, que el backend NUNCA lee
    // para esta validación (exige `motivo` — ver caja.service.ts) — el 400
    // "Debes indicar un motivo..." salía aunque el cajero sí hubiera
    // escrito algo. El payload es exactamente el que POSPage/CajaPage
    // reenvían sin tocar (spread directo), así que este es el contrato real
    // contra el backend.
    it('con el motivo escrito, Grabar se habilita y manda el texto en `motivo` (no en `notas`)', async () => {
      const onCerrar = vi.fn().mockResolvedValue(undefined);
      render(<CierreCajaFormulario cajaHoy={CAJA_AJENA} onCerrar={onCerrar} />);

      fireEvent.change(screen.getByPlaceholderText(/El cajero no pudo cerrar/), {
        target: { value: 'El cajero no pudo cerrar, autorizado por mí' },
      });
      expect(screen.getByRole('button', { name: 'Grabar' })).not.toBeDisabled();

      fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '1500' } });
      fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText('Transferencia'), { target: { value: '100' } });
      fireEvent.change(screen.getByLabelText('Otro'), { target: { value: '25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

      await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
      const payload: CierreCajaPayload = onCerrar.mock.calls[0][0];
      expect(payload.motivo).toBe('El cajero no pudo cerrar, autorizado por mí');
      // Nunca duplicado en notas — el backend ya arma su propia marca desde `motivo`.
      expect(payload.notas).toBeUndefined();
    });

    it('esMiCaja true (caja propia): no muestra ningún aviso, Grabar no requiere motivo', () => {
      render(<CierreCajaFormulario cajaHoy={{ ...CAJA_HOY, esMiCaja: true }} onCerrar={vi.fn().mockResolvedValue(undefined)} />);
      expect(screen.queryByText(/Estás cerrando la caja de/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Grabar' })).not.toBeDisabled();
    });

    it('esMiCaja true (caja propia): la nota de cierre viaja en `notas`, nunca en `motivo`', async () => {
      const onCerrar = vi.fn().mockResolvedValue(undefined);
      render(<CierreCajaFormulario cajaHoy={{ ...CAJA_HOY, esMiCaja: true }} onCerrar={onCerrar} />);

      fireEvent.change(screen.getByPlaceholderText('Nota de cierre...'), { target: { value: 'Turno sin novedades' } });
      fireEvent.change(screen.getByLabelText('Efectivo'), { target: { value: '1500' } });
      fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText('Transferencia'), { target: { value: '100' } });
      fireEvent.change(screen.getByLabelText('Otro'), { target: { value: '25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Grabar' }));

      await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
      const payload: CierreCajaPayload = onCerrar.mock.calls[0][0];
      expect(payload.notas).toBe('Turno sin novedades');
      expect(payload.motivo).toBeUndefined();
    });

    it('esMiCaja undefined (caller que todavía no lo pasa, o backend viejo): se comporta como antes, sin aviso ni bloqueo', () => {
      render(<CierreCajaFormulario cajaHoy={CAJA_HOY} onCerrar={vi.fn().mockResolvedValue(undefined)} />);
      expect(screen.queryByText(/Estás cerrando la caja de/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Grabar' })).not.toBeDisabled();
    });
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
      // Cheque va al bucket "transferencia" (DGII tipo 2) — Otro se queda en
      // "otros", así los 4 buckets quedan en positivo y no pide confirmar
      // ningún RD$0.00 antes de llegar al flujo de descuadre que prueba este bloque.
      fireEvent.change(screen.getByLabelText('Cheque'), { target: { value: '25' } });
      fireEvent.change(screen.getByLabelText('Otro'), { target: { value: '10' } });
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
