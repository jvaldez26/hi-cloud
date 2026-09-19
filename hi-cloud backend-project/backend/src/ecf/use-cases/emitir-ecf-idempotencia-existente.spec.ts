/**
 * Fix urgente — Sentry #7742858869 (factura FAC-15227, empresa 44, tipo E32).
 *
 * PATCH /facturas/:id/estado intentó emitir un e-CF para una factura que YA
 * tenía uno en ENVIADO — estado que el chequeo de idempotencia no cubría:
 * solo manejaba ACEPTADO (retorna) y RECHAZADO/CONTINGENCIA (reintenta con
 * nuevo eNCF). Cualquier otro estado (ENVIADO, PENDIENTE_ENVIO, OBSERVADO)
 * caía en silencio al flujo normal e intentaba insertar una segunda fila
 * para el mismo facturaId — reventando contra la constraint uno-a-uno
 * (corregida aparte, ver migración 1765300000000 y ecf.entity.ts).
 *
 * Cobertura: para cada estado no-retriable, execute() debe lanzar
 * EcfDuplicadoError con el eNCF y estado existentes, SIN llamar al
 * generador de números — el número nunca se toca cuando no hace falta.
 */

import { EmitirECFUseCase } from './emitir-ecf.use-case';
import { EcfDuplicadoError } from '../errors/ecf.errors';
import { DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';

function montarCaso(existente: { numero: string; estadoDGII: EstadoDGII } | null) {
  const generator = {
    generateNextEnTransaccion: jest.fn().mockRejectedValue(new Error('no debe llamarse')),
    generateNext: jest.fn().mockRejectedValue(new Error('no debe llamarse')),
  };

  const uc = new EmitirECFUseCase(
    { findOne: jest.fn().mockResolvedValue(existente) } as any,   // ecfRepo
    {} as any,                                                     // eventoRepo
    {} as any,                                                     // secuenciaRepo
    {} as any,                                                     // configRepo
    { findOne: jest.fn().mockResolvedValue({ id: 1, empresaId: 1 }) } as any, // facturaRepo
    {} as any, {} as any, {} as any, {} as any,                     // notaDebito/notaCredito/compra/gasto repos
    generator as any,
    {} as any,                                                      // builder
    {} as any,                                                      // mseller
    {} as any,                                                      // configSvc
    {} as any,                                                      // rncService
    {} as any,                                                      // vinculoCliente
    {} as any,                                                      // cuotaEcf
    {} as any,                                                      // DataSource
  );

  return { uc, generator };
}

const INPUT = {
  empresaId: 1,
  documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
  documentoOrigenId: 19777,
  tipoEcf: 32,
};

describe('EmitirECFUseCase — idempotencia con e-CF existente en estado no-terminal', () => {
  it.each([EstadoDGII.ENVIADO, EstadoDGII.PENDIENTE_ENVIO, EstadoDGII.OBSERVADO])(
    'estado %s: lanza EcfDuplicadoError con el eNCF y estado existentes, sin generar número',
    async (estado) => {
      const { uc, generator } = montarCaso({ numero: 'E320000012345', estadoDGII: estado });

      await expect(uc.execute(INPUT)).rejects.toThrow(EcfDuplicadoError);
      await expect(uc.execute(INPUT)).rejects.toMatchObject({
        encf: 'E320000012345',
        estado,
      });
      expect(generator.generateNextEnTransaccion).not.toHaveBeenCalled();
    },
  );

  it('el mensaje del error nombra el eNCF existente y su estado (para que el caller no adivine)', async () => {
    const { uc } = montarCaso({ numero: 'E320000012345', estadoDGII: EstadoDGII.PENDIENTE_ENVIO });

    await expect(uc.execute(INPUT)).rejects.toThrow(/E320000012345/);
    await expect(uc.execute(INPUT)).rejects.toThrow(/pendiente_envio/);
  });
});
