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
  CrearDesembolsoParcialDto, ReestructurarPrestamoDto, CondonarPrestamoDto,
  RegistrarGestionDto, AsignarCobradorDto,
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

describe('CrearPrestamoDto — desembolsoInicial (§4)', () => {
  it('acepta un desembolso inicial menor al monto (desembolso parcial)', async () => {
    expect(await valido(CrearPrestamoDto, { solicitudId: 1, desembolsoInicial: 5000 })).toBe(true);
  });

  it('rechaza un desembolso inicial negativo', async () => {
    expect(await valido(CrearPrestamoDto, { solicitudId: 1, desembolsoInicial: -1 })).toBe(false);
  });

  it('acepta un desembolso inicial de 0 (nace 100% pendiente de desembolsar)', async () => {
    expect(await valido(CrearPrestamoDto, { solicitudId: 1, desembolsoInicial: 0 })).toBe(true);
  });
});

describe('CrearDesembolsoParcialDto (§4)', () => {
  const base = { prestamoId: 5, monto: 2000, fecha: '2026-10-10' };

  it('acepta un tramo normal', async () => {
    expect(await valido(CrearDesembolsoParcialDto, base)).toBe(true);
  });

  it.each([0, -1])('rechaza monto %s', async (monto) => {
    expect(await valido(CrearDesembolsoParcialDto, { ...base, monto })).toBe(false);
  });

  it('exige prestamoId y fecha', async () => {
    expect(await valido(CrearDesembolsoParcialDto, { monto: 100 })).toBe(false);
  });

  it('rechaza una fecha inválida', async () => {
    expect(await valido(CrearDesembolsoParcialDto, { ...base, fecha: 'ayer' })).toBe(false);
  });
});

describe('ReestructurarPrestamoDto (§5)', () => {
  it('acepta reestructurar solo con motivo (nada más cambia)', async () => {
    expect(await valido(ReestructurarPrestamoDto, { motivo: 'El deudor pidió extender el plazo' })).toBe(true);
  });

  it('exige motivo', async () => {
    expect(await valido(ReestructurarPrestamoDto, {})).toBe(false);
    expect(await valido(ReestructurarPrestamoDto, { motivo: '' })).toBe(false);
  });

  it('solo admite francés o alemán como nuevo método', async () => {
    expect(await valido(ReestructurarPrestamoDto, { motivo: 'x', nuevoMetodoAmortizacion: 'frances' })).toBe(true);
    expect(await valido(ReestructurarPrestamoDto, { motivo: 'x', nuevoMetodoAmortizacion: 'flat' })).toBe(false);
  });

  it('rechaza plazo o tasa negativos', async () => {
    expect(await valido(ReestructurarPrestamoDto, { motivo: 'x', nuevoPlazoMeses: 0 })).toBe(false);
    expect(await valido(ReestructurarPrestamoDto, { motivo: 'x', nuevaTasaInteresMensual: -1 })).toBe(false);
  });
});

describe('CondonarPrestamoDto (§6)', () => {
  it('acepta condonar solo mora, solo interés, o ambos', async () => {
    expect(await valido(CondonarPrestamoDto, { motivo: 'x', moraACondonar: 100 })).toBe(true);
    expect(await valido(CondonarPrestamoDto, { motivo: 'x', interesACondonar: 50 })).toBe(true);
    expect(await valido(CondonarPrestamoDto, { motivo: 'x', moraACondonar: 100, interesACondonar: 50 })).toBe(true);
  });

  it('exige motivo', async () => {
    expect(await valido(CondonarPrestamoDto, { moraACondonar: 100 })).toBe(false);
  });

  it('rechaza montos negativos', async () => {
    expect(await valido(CondonarPrestamoDto, { motivo: 'x', moraACondonar: -1 })).toBe(false);
    expect(await valido(CondonarPrestamoDto, { motivo: 'x', interesACondonar: -1 })).toBe(false);
  });

  it('no existe ningún campo para condonar capital — fuera de alcance por diseño', async () => {
    const errs = await errores(CondonarPrestamoDto, { motivo: 'x', capitalACondonar: 100 });
    expect(errs.join(' ')).toMatch(/should not exist/i);
  });
});

describe('RegistrarGestionDto (Etapa 3 — Cobranza)', () => {
  const base = { prestamoId: 1, descripcion: 'Llamó, dijo que paga el viernes' };

  it('acepta una gestión mínima (solo prestamoId + descripción)', async () => {
    expect(await valido(RegistrarGestionDto, base)).toBe(true);
  });

  it('exige descripción no vacía', async () => {
    expect(await valido(RegistrarGestionDto, { ...base, descripcion: '' })).toBe(false);
    expect(await valido(RegistrarGestionDto, { prestamoId: 1 })).toBe(false);
  });

  it('solo admite los tipos del catálogo de gestión', async () => {
    expect(await valido(RegistrarGestionDto, { ...base, tipo: 'llamada' })).toBe(true);
    expect(await valido(RegistrarGestionDto, { ...base, tipo: 'telegrama' })).toBe(false);
  });

  it('solo admite los resultados del catálogo', async () => {
    expect(await valido(RegistrarGestionDto, { ...base, resultado: 'promesa_pago' })).toBe(true);
    expect(await valido(RegistrarGestionDto, { ...base, resultado: 'contactado' })).toBe(false);
  });

  it('rechaza montoPrometido negativo', async () => {
    expect(await valido(RegistrarGestionDto, { ...base, montoPrometido: -1 })).toBe(false);
  });

  it('el formulario no puede mandar cobradorId a mano — se toma SIEMPRE del usuario autenticado', async () => {
    const errs = await errores(RegistrarGestionDto, { ...base, cobradorId: 99 });
    expect(errs.join(' ')).toMatch(/should not exist/i);
  });
});

describe('AsignarCobradorDto (Etapa 3 — reasignación de cartera)', () => {
  it('acepta un cobradorId positivo', async () => {
    expect(await valido(AsignarCobradorDto, { cobradorId: 5 })).toBe(true);
  });

  it('acepta cobradorId null para desasignar', async () => {
    expect(await valido(AsignarCobradorDto, { cobradorId: null })).toBe(true);
  });

  it('acepta el body vacío (equivalente a desasignar)', async () => {
    expect(await valido(AsignarCobradorDto, {})).toBe(true);
  });

  it('rechaza un cobradorId que no sea un entero positivo', async () => {
    expect(await valido(AsignarCobradorDto, { cobradorId: 0 })).toBe(false);
    expect(await valido(AsignarCobradorDto, { cobradorId: -3 })).toBe(false);
  });
});
