import { BadRequestException } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';

jest.mock('../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
  reportServerError:  jest.fn(),
}));

/**
 * EL BUG REAL: FAC-124 (empresa 59) se emitió con "2027" en vez de "2026" —
 * un año de diferencia por error de tecleo. Salió igual, DGII la aceptó con
 * esa fecha, y el error solo se descubrió después, al intentar la Nota de
 * Crédito para corregirla (e34.builder.ts la rechaza por referenciar una
 * fecha futura). Este guard corta ANTES, al emitir, para que un año mal
 * tecleado no llegue siquiera a DGII.
 *
 * Mismo patrón liviano que siete-caminos.spec.ts: instancia sin DI real,
 * con lo mínimo mockeado para llegar al guard — que es el primer chequeo
 * dentro de `if (estado === EMITIDA)`, antes de tocar vendedor/e-CF/etc.
 * Para el caso "no bloquea", se corta la ejecución justo después con un
 * rechazo centinela de limitesService, igual que hace el otro spec.
 */

const EMPRESA = 61;
const ALTO = Symbol('alto-tras-el-guard-de-fecha');

const repoCaptor = () => ({
  update:  jest.fn().mockResolvedValue({ affected: 1 }),
  findOne: jest.fn(),
});

function emitirConFecha(fecha: Date | string) {
  const svc: any = Object.create(FacturasService.prototype);
  svc.logger            = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  svc.facturaRepository = repoCaptor();
  svc.vendedorResolver  = { resolverVendedor: jest.fn().mockResolvedValue({}) };
  svc.tenantService     = { getUserId: () => 94, getEmpresaId: () => EMPRESA };
  svc.cajaService       = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
  svc.limitesService    = { verificarLimiteIngresos: jest.fn().mockRejectedValue(ALTO) };
  svc.findOne           = jest.fn().mockResolvedValue({
    id: 777, empresaId: EMPRESA, estado: FacturaEstado.BORRADOR,
    folio: 'FAC-777', total: 1000, fecha, vendedorId: 38,
  });

  return svc.cambiarEstado(777, FacturaEstado.EMITIDA);
}

describe('cambiarEstado — la fecha de la factura no puede estar a más de 30 días de hoy', () => {
  it('EL BUG: un año adelantado (el caso real de FAC-124) se bloquea con un mensaje claro', async () => {
    const unAnoAdelante = new Date();
    unAnoAdelante.setFullYear(unAnoAdelante.getFullYear() + 1);

    await expect(emitirConFecha(unAnoAdelante)).rejects.toThrow(BadRequestException);
    await expect(emitirConFecha(unAnoAdelante)).rejects.toThrow(/más de 30 días/);
  });

  it('un año atrasado también se bloquea — el guard es simétrico', async () => {
    const unAnoAtras = new Date();
    unAnoAtras.setFullYear(unAnoAtras.getFullYear() - 1);

    await expect(emitirConFecha(unAnoAtras)).rejects.toThrow(BadRequestException);
  });

  it('hoy mismo no bloquea — sigue de largo hasta el siguiente paso', async () => {
    await expect(emitirConFecha(new Date())).rejects.toBe(ALTO);
  });

  it('dentro de los 30 días (pasado o futuro) no bloquea', async () => {
    const hace20Dias = new Date();
    hace20Dias.setDate(hace20Dias.getDate() - 20);
    await expect(emitirConFecha(hace20Dias)).rejects.toBe(ALTO);

    const en20Dias = new Date();
    en20Dias.setDate(en20Dias.getDate() + 20);
    await expect(emitirConFecha(en20Dias)).rejects.toBe(ALTO);
  });

  it('justo en el límite de 31 días sí bloquea — el corte está en >30, no en ≥30', async () => {
    const hace31Dias = new Date();
    hace31Dias.setDate(hace31Dias.getDate() - 31);
    await expect(emitirConFecha(hace31Dias)).rejects.toThrow(BadRequestException);
  });
});
