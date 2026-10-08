/**
 * "Ya existe en el sistema" — MSeller devuelve esto (un 400) cuando un envío
 * anterior del MISMO eNCF ya fue procesado (la respuesta se perdió por
 * timeout, o un reintento llegó tarde). NO es un rechazo real: el documento
 * SÍ fue recibido. El riesgo que esta prueba cierra: que ese "ya existe" se
 * interprete como RECHAZADO — un e-CF realmente aceptado por la DGII
 * terminando marcado como rechazado en la base, por una confusión de
 * transporte. Verificado explícitamente a pedido (2026-10-07, revisión del
 * fix de Sentry #7779557844): esErrorYaExiste/consultarExistenciaEncf/
 * decidirReconciliacionEcf SIEMPRE consultan el estado real antes de decidir,
 * y solo marcan RECHAZADO cuando esa consulta confirma un rechazo real.
 */
import { EstadoDGII } from '../entities/ecf.entity';
import {
  esErrorYaExiste,
  consultarExistenciaEncf,
  decidirReconciliacionEcf,
} from './reconciliacion-ecf.helper';

const NUMERO = 'E320000000123';
const EMPRESA = 7;

function msellerStub(resultado: { found: boolean; status?: string } | 'falla' | 'sin_item') {
  return {
    consultarBatch: jest.fn().mockImplementation(async () => {
      if (resultado === 'falla') throw new Error('MSeller caído');
      if (resultado === 'sin_item') return { results: [] };
      return { results: [{ ecf: NUMERO, found: resultado.found, status: resultado.status }] };
    }),
  } as any;
}

describe('esErrorYaExiste', () => {
  it('reconoce el mensaje real observado de MSeller', () => {
    expect(esErrorYaExiste({ message: 'El documento con eNCF E320000000123 ya existe en el sistema. No se puede procesar el mismo eNCF nuevamente.' })).toBe(true);
  });

  it('también lo reconoce en `detalle`, case-insensitive', () => {
    expect(esErrorYaExiste({ detalle: 'YA EXISTE en el sistema' })).toBe(true);
  });

  it('un 400 cualquiera (validación real, no "ya existe") → false', () => {
    expect(esErrorYaExiste({ message: 'RNC del comprador inválido' })).toBe(false);
  });
});

describe('consultarExistenciaEncf — nunca decide un estado fiscal sin confirmación', () => {
  it('MSeller confirma que SÍ existe y está ACEPTADO → tipo existe, estado ACEPTADO (nunca RECHAZADO por "ya existe")', async () => {
    const r = await consultarExistenciaEncf(msellerStub({ found: true, status: 'ACEPTADO' }), NUMERO, EMPRESA);
    expect(r).toEqual({ tipo: 'existe', estado: EstadoDGII.ACEPTADO });
  });

  it('MSeller confirma que SÍ existe pero el status real es RECHAZADO → eso SÍ es un rechazo real, se adopta tal cual', async () => {
    const r = await consultarExistenciaEncf(msellerStub({ found: true, status: 'RECHAZADO' }), NUMERO, EMPRESA);
    expect(r).toEqual({ tipo: 'existe', estado: EstadoDGII.RECHAZADO });
  });

  it('existe pero con un status en tránsito (PROCESANDO/RECIBIDO) → ENVIADO, nunca un veredicto final inventado', async () => {
    const r1 = await consultarExistenciaEncf(msellerStub({ found: true, status: 'PROCESANDO' }), NUMERO, EMPRESA);
    const r2 = await consultarExistenciaEncf(msellerStub({ found: true, status: 'RECIBIDO' }), NUMERO, EMPRESA);
    expect(r1).toEqual({ tipo: 'existe', estado: EstadoDGII.ENVIADO });
    expect(r2).toEqual({ tipo: 'existe', estado: EstadoDGII.ENVIADO });
  });

  it('existe pero con un status que no se puede mapear → se adopta ENVIADO (fail-safe), NUNCA RECHAZADO por default', async () => {
    const r = await consultarExistenciaEncf(msellerStub({ found: true, status: 'ALGO-NUEVO-DE-MSELLER' }), NUMERO, EMPRESA);
    expect(r).toEqual({ tipo: 'existe', estado: EstadoDGII.ENVIADO });
  });

  it('MSeller confirma que NO existe → no_existe (reenviar es seguro)', async () => {
    const r = await consultarExistenciaEncf(msellerStub({ found: false }), NUMERO, EMPRESA);
    expect(r).toEqual({ tipo: 'no_existe' });
  });

  it('la consulta falla, o no devuelve el eNCF → desconocido (fail-safe, nunca decide)', async () => {
    expect(await consultarExistenciaEncf(msellerStub('falla'), NUMERO, EMPRESA)).toEqual({ tipo: 'desconocido' });
    expect(await consultarExistenciaEncf(msellerStub('sin_item'), NUMERO, EMPRESA)).toEqual({ tipo: 'desconocido' });
  });
});

describe('decidirReconciliacionEcf — la decisión única que comparte el cron y el use-case', () => {
  it('existe y aceptado → adoptar (nunca reenviar un eNCF que la DGII ya tiene)', async () => {
    const d = await decidirReconciliacionEcf(msellerStub({ found: true, status: 'ACEPTADO' }), NUMERO, EMPRESA);
    expect(d).toEqual({ accion: 'adoptar', estado: EstadoDGII.ACEPTADO });
  });

  it('existe y el status real es RECHAZADO → dejar_rechazado (es un rechazo real de DGII, no "ya existe" mal interpretado)', async () => {
    const d = await decidirReconciliacionEcf(msellerStub({ found: true, status: 'RECHAZADO' }), NUMERO, EMPRESA);
    expect(d).toEqual({ accion: 'dejar_rechazado' });
  });

  it('no existe → reenviar', async () => {
    const d = await decidirReconciliacionEcf(msellerStub({ found: false }), NUMERO, EMPRESA);
    expect(d).toEqual({ accion: 'reenviar' });
  });

  it('consulta inconclusa → esperar (jamás "dejar_rechazado" por no saber)', async () => {
    const d = await decidirReconciliacionEcf(msellerStub('falla'), NUMERO, EMPRESA);
    expect(d).toEqual({ accion: 'esperar' });
  });
});
