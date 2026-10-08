/**
 * Fix urgente — Sentry #7742858869 (factura FAC-15227, empresa 44, tipo E32),
 * endurecido después por Sentry #7779557844 (factura 25150, empresa 73).
 *
 * PATCH /facturas/:id/estado intentó emitir un e-CF para una factura que YA
 * tenía uno en ENVIADO — estado que el chequeo de idempotencia no cubría:
 * solo manejaba ACEPTADO (retorna) y RECHAZADO/CONTINGENCIA (reintenta con
 * nuevo eNCF). Cualquier otro estado (ENVIADO, PENDIENTE_ENVIO, OBSERVADO)
 * caía en silencio al flujo normal e intentaba insertar una segunda fila
 * para el mismo facturaId — reventando contra la constraint uno-a-uno
 * (corregida aparte, ver migración 1765300000000 y ecf.entity.ts).
 *
 * El fix original (2026-07) cortaba esa carrera lanzando EcfDuplicadoError.
 * Eso resolvió el crash, pero una segunda petición CASI SIMULTÁNEA sobre la
 * MISMA venta (doble clic, el reintento que el propio POS le pedía al
 * cajero) es exactamente este mismo camino — y no es un fallo, es la venta
 * en curso. Desde 2026-10-07 ya NO lanza: devuelve el estado real del e-CF
 * existente con `enCurso:true`, sin generar número nuevo ni tocar la
 * secuencia — el caller (POS, el botón "Emitir", etc.) lo trata como "en
 * proceso", nunca como un error rojo.
 */

import { EmitirECFUseCase } from './emitir-ecf.use-case';
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
    'estado %s: devuelve enCurso:true con el eNCF y estado existentes — NO lanza, sin generar número',
    async (estado) => {
      const { uc, generator } = montarCaso({ numero: 'E320000012345', estadoDGII: estado });

      const resultado = await uc.execute(INPUT);

      expect(resultado).toMatchObject({
        encf:    'E320000012345',
        estado,
        enCurso: true,
      });
      expect(generator.generateNextEnTransaccion).not.toHaveBeenCalled();
    },
  );

  it('ACEPTADO sigue siendo idempotente puro (idempotente:true) — no es "en curso", ya terminó', async () => {
    const { uc } = montarCaso({ numero: 'E320000012345', estadoDGII: EstadoDGII.ACEPTADO });

    const resultado = await uc.execute(INPUT);

    expect(resultado).toMatchObject({ encf: 'E320000012345', estado: EstadoDGII.ACEPTADO, idempotente: true });
    expect((resultado as any).enCurso).toBeUndefined();
  });

  it('dos llamadas seguidas sobre un e-CF en curso dan el mismo resultado — es seguro llamarlo repetidas veces', async () => {
    const { uc } = montarCaso({ numero: 'E320000012345', estadoDGII: EstadoDGII.PENDIENTE_ENVIO });

    const r1 = await uc.execute(INPUT);
    const r2 = await uc.execute(INPUT);

    expect(r1).toMatchObject({ encf: 'E320000012345', enCurso: true });
    expect(r2).toMatchObject({ encf: 'E320000012345', enCurso: true });
  });
});
