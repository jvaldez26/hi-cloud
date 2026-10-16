/**
 * BancosService.listarMovimientos() / getResumenConciliacion() — unifican
 * las DOS tablas que pueden componer el saldo de una cuenta
 * (`bancos_conciliacion` y `movimientos_bancarios`), más el saldo de
 * apertura como primera línea del historial. Requisito explícito tras el
 * incidente 2026-10-15 (empresa 53): "el saldo nunca puede incluir algo
 * que la lista no muestre".
 */
import { BancosService } from './bancos.service';
import { TipoMovimientoBanco } from './entities/movimiento-bancario.entity';

const CUENTA = {
  id: 7, empresaId: 53, nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK',
  numeroCuenta: '63150001851', saldoInicial: 16202.56, createdAt: new Date('2026-10-15T18:23:04Z'),
};

function makeService(opts: {
  movimientosBancos?: any[];
  movimientosTesoreria?: any[];
}) {
  const movsBancos = opts.movimientosBancos ?? [];
  const movsTesoreria = opts.movimientosTesoreria ?? [];

  const qb: any = {
    where: function () { return this; },
    andWhere: function () { return this; },
    getMany: async () => movsBancos,
  };

  const svc: any = Object.create(BancosService.prototype);
  svc.logger = { log: jest.fn() };
  svc.cuentaRepo = {
    findOne: jest.fn().mockResolvedValue(CUENTA),
    manager: { query: jest.fn().mockResolvedValue(movsTesoreria) },
  };
  svc.movRepo = {
    createQueryBuilder: () => qb,
    find: jest.fn().mockResolvedValue(movsBancos),
  };
  svc.tenantService = { getEmpresaId: () => 53 };
  return svc;
}

describe('BancosService.listarMovimientos — lista unificada', () => {
  it('cuenta con SOLO saldo inicial (sin movimientos en ninguna tabla): el historial trae únicamente "Saldo de apertura"', async () => {
    const svc = makeService({});
    const r = await svc.listarMovimientos(7, { page: 1, limit: 20 });
    expect(r.data).toHaveLength(1);
    expect(r.data[0].descripcion).toBe('Saldo de apertura');
    expect(r.data[0].monto).toBe(16202.56);
    expect(r.data[0].origenTabla).toBe('apertura');
  });

  it('con movimientos en bancos_conciliacion Y movimientos_bancarios: la lista trae TODOS, cada uno marcado con su tabla de origen', async () => {
    const svc = makeService({
      movimientosBancos: [{ id: 1, tipo: TipoMovimientoBanco.CREDITO, monto: 100, fecha: new Date('2026-10-16'), descripcion: 'Depósito en conciliación', conciliado: false, sistemaTipo: null }],
      movimientosTesoreria: [{ id: 2, tipo: 'deposito', monto: 24000, fecha: new Date('2026-10-15T21:55:00Z'), descripcion: 'Ajuste de saldo: pendiente confirmar', origen: 'ajuste', saldoNuevo: 40202.56, conciliado: false }],
    });
    const r = await svc.listarMovimientos(7, { page: 1, limit: 20 });
    expect(r.data).toHaveLength(3); // apertura + 1 bancos + 1 tesoreria
    const origenes = r.data.map((m: any) => m.origenTabla).sort();
    expect(origenes).toEqual(['apertura', 'bancos', 'tesoreria']);
  });

  it('nunca pierde un movimiento de tesorería solo porque bancos_conciliacion está vacía — el bug real del incidente', async () => {
    const svc = makeService({
      movimientosTesoreria: [{ id: 2, tipo: 'deposito', monto: 24000, fecha: new Date('2026-10-15'), descripcion: 'Ajuste', origen: 'ajuste', saldoNuevo: 40202.56, conciliado: false }],
    });
    const r = await svc.listarMovimientos(7, { page: 1, limit: 20 });
    const deTesoreria = r.data.find((m: any) => m.origenTabla === 'tesoreria');
    expect(deTesoreria).toBeDefined();
    expect(deTesoreria.monto).toBe(24000);
  });

  it('ordena cronológicamente — apertura (más vieja) primero', async () => {
    const svc = makeService({
      movimientosBancos: [{ id: 1, tipo: TipoMovimientoBanco.CREDITO, monto: 100, fecha: new Date('2026-11-01'), descripcion: 'Después', conciliado: false }],
    });
    const r = await svc.listarMovimientos(7, { page: 1, limit: 20 });
    expect(r.data[0].descripcion).toBe('Saldo de apertura');
    expect(r.data[1].descripcion).toBe('Después');
  });
});

describe('BancosService.getResumenConciliacion — saldo inicial del mes con ambas tablas', () => {
  it('cuenta con solo saldo inicial: el saldo inicial de cualquier mes es exactamente ese, sin movimientos', async () => {
    const svc = makeService({});
    const r = await svc.getResumenConciliacion(7, 10, 2026);
    expect(r.saldoInicial).toBe(16202.56);
    expect(r.totalCreditos).toBe(0);
    expect(r.totalDebitos).toBe(0);
    expect(r.saldoFinal).toBe(16202.56);
    expect(r.saldoActual).toBe(16202.56);
  });

  it('con un movimiento de tesorería DENTRO del mes consultado: entra en créditos/débitos del período, no en el saldo inicial', async () => {
    const svc = makeService({
      movimientosTesoreria: [{ tipo: 'deposito', monto: 24000, fecha: '2026-10-15' }],
    });
    const r = await svc.getResumenConciliacion(7, 10, 2026);
    expect(r.saldoInicial).toBe(16202.56); // el movimiento es de octubre, no es "anterior al mes"
    expect(r.totalCreditos).toBe(24000);
    expect(r.saldoFinal).toBe(40202.56);
    expect(r.saldoActual).toBe(40202.56);
  });

  it('con un movimiento ANTERIOR al mes consultado: se suma al saldo inicial de ese mes, no a los créditos del período', async () => {
    const svc = makeService({
      movimientosTesoreria: [{ tipo: 'deposito', monto: 24000, fecha: '2026-09-01' }],
    });
    const r = await svc.getResumenConciliacion(7, 10, 2026); // consultando octubre
    expect(r.saldoInicial).toBe(40202.56); // 16202.56 + 24000, ya incluido en el inicial
    expect(r.totalCreditos).toBe(0);
    expect(r.saldoFinal).toBe(40202.56);
  });

  it('permite ver meses anteriores: el saldo inicial de un mes previo al movimiento no lo incluye', async () => {
    const svc = makeService({
      movimientosTesoreria: [{ tipo: 'deposito', monto: 24000, fecha: '2026-10-15' }],
    });
    const r = await svc.getResumenConciliacion(7, 9, 2026); // septiembre, antes del movimiento
    expect(r.saldoInicial).toBe(16202.56);
    expect(r.totalCreditos).toBe(0);
    expect(r.saldoFinal).toBe(16202.56);
    // saldoActual siempre es el de HOY (replay completo), no el del mes consultado.
    expect(r.saldoActual).toBe(40202.56);
  });

  it('combina movimientos de bancos_conciliacion Y movimientos_bancarios en el mismo período', async () => {
    const svc = makeService({
      movimientosBancos: [{ id: 1, tipo: TipoMovimientoBanco.DEBITO, monto: 50, fecha: new Date('2026-10-10'), conciliado: false }],
      movimientosTesoreria: [{ tipo: 'deposito', monto: 24000, fecha: '2026-10-15' }],
    });
    const r = await svc.getResumenConciliacion(7, 10, 2026);
    expect(r.totalCreditos).toBe(24000);
    expect(r.totalDebitos).toBe(50);
    expect(r.saldoFinal).toBe(16202.56 + 24000 - 50);
    expect(r.movimientosPeriodo).toBe(2);
  });
});
