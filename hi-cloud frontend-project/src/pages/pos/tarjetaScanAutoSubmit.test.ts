import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoEnvioTarjeta, enmascararCodigoTarjeta, ESPERA_AUTOENVIO_MS } from './tarjetaScanAutoSubmit';
import { PREFIJO_TARJETA_SUPERVISOR } from '../../utils/tarjetaSupervisor';

const CODIGO_COMPLETO = PREFIJO_TARJETA_SUPERVISOR + '1234567890123456789012'; // 24 dígitos, formato exacto
const CODIGO_INCOMPLETO = PREFIJO_TARJETA_SUPERVISOR + '123'; // le faltan dígitos

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('AutoEnvioTarjeta — escaneo de tarjeta de supervisor', () => {
  it('valor completo sin Enter: se envía solo, una sola vez, tras la pausa', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alCambiar(CODIGO_COMPLETO);
    expect(enviar).not.toHaveBeenCalled(); // no antes de la pausa

    vi.advanceTimersByTime(ESPERA_AUTOENVIO_MS - 1);
    expect(enviar).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(CODIGO_COMPLETO);
  });

  it('valor completo + Enter inmediato: una sola petición (el Enter gana y cancela el debounce pendiente)', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alCambiar(CODIGO_COMPLETO); // arranca el debounce de 150ms
    auto.alEnter(CODIGO_COMPLETO);   // el escáner también mandó Enter, antes de que venza el debounce

    vi.advanceTimersByTime(ESPERA_AUTOENVIO_MS + 50); // si el debounce no se hubiera cancelado, dispararía aquí también

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('valor completo + Enter DESPUÉS de que ya disparó el debounce: tampoco duplica', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alCambiar(CODIGO_COMPLETO);
    vi.advanceTimersByTime(ESPERA_AUTOENVIO_MS);
    expect(enviar).toHaveBeenCalledTimes(1);

    auto.alEnter(CODIGO_COMPLETO); // el escáner manda Enter después — ya se envió, no debe repetir
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('valor incompleto: nunca se envía solo, con o sin pausa', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alCambiar(CODIGO_INCOMPLETO);
    vi.advanceTimersByTime(ESPERA_AUTOENVIO_MS * 10);

    expect(enviar).not.toHaveBeenCalled();
  });

  it('teclas nuevas antes de que venza la pausa reinician el debounce (el escáner aún no terminó)', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alCambiar(CODIGO_COMPLETO.slice(0, -1)); // incompleto todavía
    vi.advanceTimersByTime(ESPERA_AUTOENVIO_MS - 10);
    auto.alCambiar(CODIGO_COMPLETO); // llega el último dígito — recién aquí el valor es completo

    vi.advanceTimersByTime(ESPERA_AUTOENVIO_MS - 1);
    expect(enviar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('reset() permite un siguiente envío (p.ej. tras un intento fallido, para reescanear)', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alEnter(CODIGO_COMPLETO);
    expect(enviar).toHaveBeenCalledTimes(1);

    auto.alEnter(CODIGO_COMPLETO); // sin reset, no debe reenviar
    expect(enviar).toHaveBeenCalledTimes(1);

    auto.reset();
    auto.alEnter(CODIGO_COMPLETO);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('un valor vacío nunca se envía', () => {
    const enviar = vi.fn();
    const auto = new AutoEnvioTarjeta(enviar);

    auto.alEnter('');
    auto.alEnter('   ');
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe('enmascararCodigoTarjeta — el campo nunca muestra el código completo', () => {
  it('código vacío → texto vacío', () => {
    expect(enmascararCodigoTarjeta('')).toBe('');
  });

  it('código completo (24 dígitos) → solo "•••• " + los últimos 4, nunca el código entero', () => {
    const resultado = enmascararCodigoTarjeta(CODIGO_COMPLETO);
    expect(resultado).toBe('•••• ' + CODIGO_COMPLETO.slice(-4));
    expect(resultado).not.toContain(CODIGO_COMPLETO);
    expect(resultado.length).toBeLessThan(CODIGO_COMPLETO.length);
  });

  it('mientras se escanea (pocos dígitos todavía) tampoco revela más de 4 caracteres', () => {
    const parcial = CODIGO_COMPLETO.slice(0, 7); // "9" + 6 dígitos
    const resultado = enmascararCodigoTarjeta(parcial);
    expect(resultado).toBe('•••• ' + parcial.slice(-4));
    expect(resultado).not.toBe(parcial);
  });
});
