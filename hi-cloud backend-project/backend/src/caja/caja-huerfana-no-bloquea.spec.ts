import { CajaService } from './caja.service';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

/**
 * Incidente real (2026-10-16, empresa 44, Ventas Populares R&M): el POS
 * bloqueaba el cobro con "Caja no abierta" — el diagnóstico encontró DOS
 * causas, no una. Esta prueba cubre la del backend: una caja ABIERTA desde
 * un turno que cruza la medianoche (huérfana) ya NO bloquea la venta —
 * solo deja una advertencia (ver caja-precheck-gate del lado del frontend
 * para la otra causa, el precheck local que SÍ bloqueaba sin llegar al
 * servidor).
 *
 * Regla explícita: "si el cajero tiene CUALQUIER caja abierta, de hoy o de
 * antes, en su sucursal, el cobro procede. El error solo aparece si de
 * verdad no hay ninguna".
 */

const EMPRESA = 44;

function buildDeps(controlCajaActivo = true) {
  return {
    repo: {
      findOne: jest.fn(),
      find:    jest.fn(),
      update:  jest.fn().mockResolvedValue(undefined),
      create:  jest.fn((d: any) => d),
      save:    jest.fn((e: any) => Promise.resolve({ id: 1, ...e })),
      createQueryBuilder: jest.fn(),
    },
    retiroRepo: { find: jest.fn(), findOne: jest.fn() },
    dataSource: {
      query: jest.fn().mockResolvedValue([{ controlCajaActivo }]),
      manager: {
        query:  jest.fn().mockResolvedValue([{}]),
        update: jest.fn().mockResolvedValue(undefined),
        getRepository: jest.fn(() => ({ find: jest.fn().mockResolvedValue([]) })),
      },
    },
    tenantSvc:   { getEmpresaId: () => EMPRESA, getSucursalId: () => undefined, getRolEmpresa: () => UserRole.ADMIN as string | null },
    realtimeSvc: { notify: jest.fn() },
    notificacionesSvc: { notificarDescuadreCierre: jest.fn().mockResolvedValue(undefined) },
    modulosAddonSvc: { checkModuloActivo: jest.fn().mockResolvedValue(true) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): CajaService {
  return new CajaService(
    d.repo as any, d.retiroRepo as any, d.dataSource as any, d.tenantSvc as any,
    d.realtimeSvc as any, d.notificacionesSvc as any, d.modulosAddonSvc as any,
  );
}

function cajaAbierta(overrides: Partial<CierreCaja> = {}): CierreCaja {
  return {
    id: 819, fecha: new Date('2026-10-16'), vendedorId: 25, vendedorNombre: 'Maximo Almonte',
    sucursalId: 45, estado: EstadoCierre.ABIERTA,
    saldoApertura: 0, ventasEfectivo: 0, ventasTarjeta: 0, ventasTransferencia: 0, ventasCredito: 0,
    cobrosRecibidos: 0, cobrosEfectivo: 0, cobrosOtrosMedios: 0,
    totalAnticipos: 0, anticiposEfectivo: 0, anticiposOtrosMedios: 0,
    gastosEfectivo: 0, retiros: 0, saldoCierre: 0, saldoFisico: 0, diferencia: 0,
    formulaVersion: 2, cantidadTransacciones: 0, userId: 66, empresaId: EMPRESA,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as CierreCaja;
}

describe('CajaService.esCajaAbiertaVendedor — una caja abierta de un día anterior YA NO bloquea', () => {
  it('caja abierta HOY: ok, sin advertencia', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ fecha: new Date(`${fechaHoyRD()}T00:00:00.000Z`) }));
    const svc = buildService(d);

    const r = await svc.esCajaAbiertaVendedor(25, EMPRESA);
    expect(r).toEqual({ ok: true });
  });

  it('caja abierta AYER (huérfana, turno que cruzó medianoche): ok:true con advertencia — nunca bloquea', async () => {
    const d = buildDeps();
    const ayer = new Date(Date.now() - 24 * 60 * 60_000);
    const ayerISO = ayer.toISOString().slice(0, 10);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ fecha: new Date(`${ayerISO}T00:00:00.000Z`) }));
    const svc = buildService(d);

    const r = await svc.esCajaAbiertaVendedor(25, EMPRESA);
    expect(r.ok).toBe(true);
    expect(r.advertencia).toMatch(/Tienes una caja abierta desde el/);
  });

  it('caja abierta hace varios días: ok:true con advertencia también (no solo "ayer")', async () => {
    const d = buildDeps();
    const haceDias = new Date(Date.now() - 5 * 24 * 60 * 60_000);
    const haceDiasISO = haceDias.toISOString().slice(0, 10);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ fecha: new Date(`${haceDiasISO}T00:00:00.000Z`) }));
    const svc = buildService(d);

    const r = await svc.esCajaAbiertaVendedor(25, EMPRESA);
    expect(r.ok).toBe(true);
    expect(r.advertencia).toBeDefined();
  });

  it('SIN ninguna caja abierta: sigue rechazando — el error solo aparece si de verdad no hay ninguna', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(null);
    const svc = buildService(d);

    const r = await svc.esCajaAbiertaVendedor(25, EMPRESA);
    expect(r).toEqual({ ok: false, mensaje: 'no_caja' });
  });

  it('empresa sin control de caja activo: ok, sin consultar nada más', async () => {
    const d = buildDeps(false);
    const svc = buildService(d);

    const r = await svc.esCajaAbiertaVendedor(25, EMPRESA);
    expect(r).toEqual({ ok: true });
    expect(d.repo.findOne).not.toHaveBeenCalled();
  });
});

// Incidente del mismo diagnóstico (empresa 44): ¿"hoy" se calcula en UTC?
// fechaHoyRD() ya usaba correctamente la zona America/Santo_Domingo — el
// riesgo real estaba en volver a envolver ese string en `new Date(hoy)`
// antes de comparar contra la columna `date` de Postgres: TypeORM lo
// reconvierte con los getters LOCALES del proceso (getFullYear/getMonth/
// getDate), correcto solo mientras el servidor corra con TZ=UTC — un
// round-trip silencioso que un cambio de configuración podría romper sin
// ningún aviso. Después de las 8pm hora RD (medianoche UTC) es exactamente
// cuando ese borde se cruzaría si el servidor no estuviera en UTC.
describe('CajaService.getCajaHoy — nunca envuelve `hoy` en `new Date(...)` antes de comparar', () => {
  const fs = require('fs');
  const path = require('path');
  const ruta = path.join(__dirname, 'caja.service.ts');
  const fuente = fs.readFileSync(ruta, 'utf8');
  const ini = fuente.indexOf('async getCajaHoy(vendedorId');
  const cuerpo = fuente.slice(ini, ini + 1600);

  it('compara `fecha` contra el string `hoy` directo, no contra `new Date(hoy)`', () => {
    expect(ini).toBeGreaterThan(-1);
    expect(cuerpo).not.toMatch(/new Date\(hoy\)/);
    expect(cuerpo).toMatch(/fecha:\s*hoy as any/);
  });
});

describe('CajaService — facturas.service.ts ya no bloquea la emisión por caja huérfana', () => {
  it('el fuente de facturas.service.ts NO lanza excepción cuando cajaCheck.advertencia está presente', () => {
    const fs = require('fs');
    const path = require('path');
    const ruta = path.join(__dirname, '../facturas/facturas.service.ts');
    const fuente = fs.readFileSync(ruta, 'utf8');
    const ini = fuente.indexOf('esCajaAbiertaVendedor(');
    expect(ini).toBeGreaterThan(-1);
    const bloque = fuente.slice(ini, ini + 700);
    // El antiguo "CAJA_HUERFANA" ya no decide un throw — solo queda el log de advertencia.
    expect(bloque).not.toMatch(/esHuerfana/);
    expect(bloque).toMatch(/cajaCheck\.advertencia/);
  });
});
