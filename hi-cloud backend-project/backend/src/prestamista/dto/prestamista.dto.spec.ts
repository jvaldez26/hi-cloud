/**
 * Validación de entrada del módulo Prestamista.
 *
 * Los 17 endpoints recibían `@Body() body: any` sin ninguna validación. Estos
 * tests fijan lo que ya NO debe entrar en un módulo que mueve dinero.
 *
 * Se validan con las mismas opciones del ValidationPipe global de main.ts
 * (whitelist + forbidNonWhitelisted), para que el test refleje producción.
 */

// Necesario para que los decoradores @Type funcionen fuera del arranque de Nest
// (en producción lo carga main.ts a través del framework).
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  RegistrarPagoDto, CrearSolicitudDto, DecidirSolicitudDto,
  CrearPrestamoDto, RefinanciarDto, CancelarPrestamoDto,
} from './prestamista.dto';

const OPCIONES_PIPE = { whitelist: true, forbidNonWhitelisted: true };

async function errores<T extends object>(Dto: new () => T, payload: any): Promise<string[]> {
  const inst = plainToInstance(Dto, payload, { enableImplicitConversion: true });
  const res  = await validate(inst as object, OPCIONES_PIPE);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}
const valido = async (Dto: any, payload: any) => (await errores(Dto, payload)).length === 0;

describe('RegistrarPagoDto — M3: el monto del pago', () => {
  const base = { prestamoId: 1, montoPagado: 1500.50 };

  it('acepta un pago normal', async () => {
    expect(await valido(RegistrarPagoDto, base)).toBe(true);
  });

  it.each([0, -1, -1500])('rechaza monto %s', async (monto) => {
    const errs = await errores(RegistrarPagoDto, { ...base, montoPagado: monto });
    expect(errs.join(' ')).toMatch(/mayor que cero/i);
  });

  it('rechaza más de 2 decimales', async () => {
    expect(await valido(RegistrarPagoDto, { ...base, montoPagado: 10.999 })).toBe(false);
  });

  it('rechaza texto como monto', async () => {
    expect(await valido(RegistrarPagoDto, { ...base, montoPagado: 'mil pesos' })).toBe(false);
  });

  it('rechaza si falta el préstamo', async () => {
    expect(await valido(RegistrarPagoDto, { montoPagado: 100 })).toBe(false);
  });

  it('descarta campos que no existen en el DTO', async () => {
    // Antes, cualquier campo del body llegaba al servicio.
    const errs = await errores(RegistrarPagoDto, { ...base, aplicadoMora: 99999, creadoPor: 7 });
    expect(errs.join(' ')).toMatch(/should not exist/i);
  });

  it('acepta el monto como string (viene de un input y de Postgres)', async () => {
    expect(await valido(RegistrarPagoDto, { prestamoId: '1', montoPagado: '250.75' })).toBe(true);
  });
});

describe('CrearSolicitudDto', () => {
  const base = { deudorId: 3, montoSolicitado: 50000, plazoMeses: 12 };

  it('acepta una solicitud normal', async () => {
    expect(await valido(CrearSolicitudDto, base)).toBe(true);
  });

  it.each([0, -5000])('rechaza monto solicitado %s', async (m) => {
    expect(await valido(CrearSolicitudDto, { ...base, montoSolicitado: m })).toBe(false);
  });

  it('rechaza plazo de 0 meses', async () => {
    expect(await valido(CrearSolicitudDto, { ...base, plazoMeses: 0 })).toBe(false);
  });

  it('exige deudorId', async () => {
    expect(await valido(CrearSolicitudDto, { montoSolicitado: 1000, plazoMeses: 6 })).toBe(false);
  });

  it('rechaza tasa de interés negativa', async () => {
    expect(await valido(CrearSolicitudDto, { ...base, tasaInteresMensual: -2 })).toBe(false);
  });
});

describe('DecidirSolicitudDto', () => {
  it('solo admite aprobada o rechazada', async () => {
    expect(await valido(DecidirSolicitudDto, { decision: 'aprobada'  })).toBe(true);
    expect(await valido(DecidirSolicitudDto, { decision: 'rechazada' })).toBe(true);
    expect(await valido(DecidirSolicitudDto, { decision: 'quizás'    })).toBe(false);
    expect(await valido(DecidirSolicitudDto, { decision: 'desembolsada' })).toBe(false);
  });

  it('no deja colar el estado por la puerta de atrás', async () => {
    const errs = await errores(DecidirSolicitudDto, { decision: 'aprobada', estado: 'desembolsada' });
    expect(errs.join(' ')).toMatch(/should not exist/i);
  });
});

describe('CrearPrestamoDto', () => {
  it('acepta el desembolso desde una solicitud (solo solicitudId)', async () => {
    expect(await valido(CrearPrestamoDto, { solicitudId: 10 })).toBe(true);
  });

  it('acepta un préstamo directo con sus parámetros', async () => {
    expect(await valido(CrearPrestamoDto, {
      deudorId: 2, montoPrincipal: 25000, plazoMeses: 6, tasaInteresMensual: 3, porcentajeMora: 5,
    })).toBe(true);
  });

  it.each([
    ['monto negativo',  { montoPrincipal: -1000 }],
    ['plazo 0',         { plazoMeses: 0 }],
    ['mora negativa',   { porcentajeMora: -1 }],
    ['días de gracia negativos', { diasGracia: -5 }],
    ['fecha inválida',  { fechaDesembolso: 'ayer' }],
  ])('rechaza %s', async (_n, extra) => {
    expect(await valido(CrearPrestamoDto, { solicitudId: 1, ...extra })).toBe(false);
  });
});

describe('RefinanciarDto', () => {
  it('acepta refinanciar indicando solo el préstamo original', async () => {
    expect(await valido(RefinanciarDto, { prestamoOriginalId: 4 })).toBe(true);
  });

  it('rechaza condonaciones negativas', async () => {
    expect(await valido(RefinanciarDto, { prestamoOriginalId: 4, moraCondonada: -100 })).toBe(false);
    expect(await valido(RefinanciarDto, { prestamoOriginalId: 4, interesCondonado: -1 })).toBe(false);
  });

  it('exige el préstamo original', async () => {
    expect(await valido(RefinanciarDto, { montoNuevo: 1000 })).toBe(false);
  });
});

describe('CancelarPrestamoDto', () => {
  it('exige motivo no vacío', async () => {
    expect(await valido(CancelarPrestamoDto, { motivo: 'Acuerdo con el cliente' })).toBe(true);
    expect(await valido(CancelarPrestamoDto, { motivo: '' })).toBe(false);
    expect(await valido(CancelarPrestamoDto, {})).toBe(false);
  });
});
