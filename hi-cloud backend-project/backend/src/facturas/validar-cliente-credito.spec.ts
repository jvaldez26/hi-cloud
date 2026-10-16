/**
 * FacturasService.validarClienteParaCredito() — una venta a crédito exige
 * un cliente identificado (cédula/RNC, no "Consumidor Final"). Caso real
 * (2026-10-16, empresa 53): factura FAC-555 a crédito a "CONSUMIDOR FINAL",
 * cobrada después sin ninguna forma real de verificar quién debía el
 * dinero — ni el nombre ni los datos fiscales identificaban a nadie.
 *
 * La validación NO usa tipoCliente: en producción 176/199 clientes (88%)
 * tienen tipoCliente=consumidor_final aunque sean empresas reales con RFC
 * cargado (verificado 2026-10-16, ver verificar-tipocliente-confiable.js).
 */
import { BadRequestException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

function makeService(clienteRow: any) {
  const svc: any = Object.create(FacturasService.prototype);
  svc.dataSource = { query: jest.fn().mockResolvedValue(clienteRow ? [clienteRow] : []) };
  return svc;
}

describe('FacturasService.validarClienteParaCredito', () => {
  it('CONTADO: nunca valida nada, sin importar el cliente', async () => {
    const svc = makeService(null);
    await expect(svc.validarClienteParaCredito('CONTADO', undefined, 53)).resolves.toBeUndefined();
    expect(svc.dataSource.query).not.toHaveBeenCalled();
  });

  it('CREDITO sin clienteId: rechaza de entrada, ni siquiera consulta la BD', async () => {
    const svc = makeService(null);
    await expect(svc.validarClienteParaCredito('CREDITO', undefined, 53)).rejects.toThrow(BadRequestException);
    expect(svc.dataSource.query).not.toHaveBeenCalled();
  });

  it('CREDITO al cliente genérico "Consumidor Final" sin RFC/RNC: rechaza', async () => {
    const svc = makeService({ rncReceptor: null, rfc: '00000000000', nombre: 'Consumidor Final' });
    await expect(svc.validarClienteParaCredito('CREDITO', 1, 53)).rejects.toThrow(BadRequestException);
  });

  it('CREDITO al cliente "CONSUMIDOR FINAL" (mayúsculas) sin RNC: rechaza', async () => {
    const svc = makeService({ rncReceptor: null, rfc: null, nombre: 'CONSUMIDOR FINAL' });
    await expect(svc.validarClienteParaCredito('CREDITO', 1, 53)).rejects.toThrow(BadRequestException);
  });

  it('CREDITO a un cliente llamado "Consumidor Final" pero CON RFC real cargado: rechaza igual (el nombre genérico nunca identifica a nadie)', async () => {
    const svc = makeService({ rncReceptor: null, rfc: '101234567', nombre: 'Consumidor Final' });
    await expect(svc.validarClienteParaCredito('CREDITO', 1, 53)).rejects.toThrow(BadRequestException);
  });

  it('CREDITO a una empresa real con RFC, aunque tipoCliente esté mal etiquetado como consumidor_final en la BD: acepta (caso real "BEST EQUIPMENT SERVICE SRL")', async () => {
    const svc = makeService({ rncReceptor: null, rfc: '101849592', nombre: 'BEST EQUIPMENT SERVICE SRL' });
    await expect(svc.validarClienteParaCredito('CREDITO', 35, 51)).resolves.toBeUndefined();
  });

  it('CREDITO a una persona identificada por cédula (rncReceptor): acepta', async () => {
    const svc = makeService({ rncReceptor: '00112345678', rfc: null, nombre: 'Juan Pérez' });
    await expect(svc.validarClienteParaCredito('CREDITO', 5, 53)).resolves.toBeUndefined();
  });

  it('CREDITO a un cliente sin RNC/cédula real (solo ceros) aunque su nombre no sea "Consumidor Final": rechaza (falta el dato real)', async () => {
    const svc = makeService({ rncReceptor: '00000000000', rfc: null, nombre: 'Cliente sin cédula' });
    await expect(svc.validarClienteParaCredito('CREDITO', 7, 53)).rejects.toThrow(BadRequestException);
  });

  it('CREDITO a un clienteId inexistente: rechaza con mensaje claro', async () => {
    const svc = makeService(undefined);
    await expect(svc.validarClienteParaCredito('CREDITO', 999, 53)).rejects.toThrow(/no encontrado/i);
  });
});
