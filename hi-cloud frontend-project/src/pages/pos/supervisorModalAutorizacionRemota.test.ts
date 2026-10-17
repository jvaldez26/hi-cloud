import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Bug real reportado (2026-10-17): un cajero preguntó "¿cómo solicito
 * supervisión remota?" en el modal propio del POS (escaneo de tarjeta + PIN
 * rápido) — no había forma de hacerlo. La autorización remota (commit
 * 0d9937f4) se conectó al modal GENÉRICO de supervisor (SupervisorAuthModal.tsx,
 * para pantallas fuera del POS) pero nunca al modal que POSPage.tsx monta
 * para sí mismo, que es donde el cajero realmente la pide — el gap quedó
 * invisible porque SupervisorAuthModal.test.tsx sí cubre el flujo remoto,
 * solo que contra el componente equivocado.
 *
 * Una prueba de comportamiento (render completo de POSPage) es
 * desproporcionada aquí — ver confirmarCobroUnicoCamino.test.ts para el
 * mismo razonamiento en este archivo. En cambio, esto prueba el invariante
 * estructural que habría atajado el gap: el modal propio del POS tiene que
 * ofrecer el mismo botón "Solicitar autorización remota" que el genérico,
 * condicionado a la misma política (pendingActionPermiteRemoto), y manejar
 * los mismos tres estados del flujo remoto (useSupervisor: remotoEnEspera,
 * remotoResultado, solicitarAutorizacionRemota/cancelarAutorizacionRemota).
 */
describe('POSPage — el modal propio de supervisor ofrece autorización remota', () => {
  const ruta = path.resolve(__dirname, './POSPage.tsx');
  const fuente = fs.readFileSync(ruta, 'utf8');
  const ini = fuente.indexOf("{/* ── Modal supervisor (modo supervisor configurable) ─");
  const fin = fuente.indexOf('<EscanerCamaraModal', ini);
  const bloque = fuente.slice(ini, fin);

  it('existe el bloque del modal de supervisor del POS', () => {
    expect(ini).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(ini);
  });

  it('ofrece "Solicitar autorización remota" condicionado a pendingActionPermiteRemoto', () => {
    expect(bloque).toMatch(/supervisor\.pendingActionPermiteRemoto/);
    expect(bloque).toMatch(/Solicitar autorización remota/);
  });

  it('maneja la espera remota (countdown + cancelar)', () => {
    expect(bloque).toMatch(/supervisor\.remotoEnEspera/);
    expect(bloque).toMatch(/supervisor\.cancelarAutorizacionRemota/);
  });

  it('maneja el resultado remoto (rechazada/expirada/cancelada)', () => {
    expect(bloque).toMatch(/supervisor\.remotoResultado/);
    expect(bloque).toMatch(/supervisor\.limpiarRemotoResultado/);
  });

  it('envía la solicitud remota con el motivo capturado', () => {
    // El handler (enviarSolicitudRemotaSup) vive fuera del JSX del modal,
    // junto al resto del estado de supervisor — se busca en todo el archivo.
    expect(bloque).toMatch(/enviarSolicitudRemotaSup/);
    expect(fuente).toMatch(/supervisor\.solicitarAutorizacionRemota\(motivoRemotoSup\.trim\(\)\)/);
  });
});
