/**
 * Motor v2 (Fase 2B) — punto 9: un test de punta a punta por cada
 * frecuencia: producto → solicitud → aprobación → desembolso → pagos →
 * saldo cero. Corre contra los 4 services REALES (no una reimplementación
 * de su lógica) con una base de datos en memoria que responde a las
 * consultas SQL exactas que cada uno hace — mismo patrón que
 * mora.cron.spec.ts (buildDs), extendido a varias tablas relacionadas.
 *
 * No es una base de datos real: es un dispatcher sobre arrays en memoria
 * que entiende las queries concretas de este módulo, no SQL arbitrario. Lo
 * que prueba de verdad es que ProductosPrestamoService, SolicitudesService,
 * PrestamosService y PagosService — tal cual están, sin tocar nada para
 * este test — encadenan correctamente usando el motor v2, para cada una de
 * las 10 frecuencias.
 */
import { ProductosPrestamoService } from './productos-prestamo/productos-prestamo.service';
import { SolicitudesService } from './solicitudes/solicitudes.service';
import { PrestamosService } from './prestamos/prestamos.service';
import { PagosService } from './pagos/pagos.service';

interface Fila { id: number; [key: string]: any }

class BaseEnMemoria {
  tablas: Record<string, Fila[]> = {
    pr_productos_prestamo: [], pr_solicitudes: [], pr_prestamos: [], pr_cuotas: [],
    pr_deudores: [{ id: 1, empresaId: 1, nombre: 'Deudor Test', totalPrestado: 0, prestamosActivos: 0, totalPagado: 0 }],
    pr_pagos: [],
  };
  private secuencia = 0;

  private siguienteId(tabla: string): number {
    return (this.tablas[tabla].reduce((max, f) => Math.max(max, f.id), 0)) + 1;
  }

  /** Dispatcher único — usado tanto por `ds.query` como por `qr.query` (misma base en memoria). */
  query = async (sql: string, params: any[] = []): Promise<any[]> => {
    // siguiente_numero_secuencia
    if (sql.includes('siguiente_numero_secuencia')) {
      this.secuencia += 1;
      return [{ num: String(this.secuencia).padStart(4, '0') }];
    }

    // INSERTs
    if (sql.includes('INSERT INTO pr_productos_prestamo')) {
      const fila = this.insertarDesdeInsert('pr_productos_prestamo', sql, params, [
        'empresaId', 'nombre', 'tipoCredito', 'descripcion', 'montoMinimo', 'montoMaximo',
        'tasaInteresMensual', 'tipoTasa', 'plazoMinimoMeses', 'plazoMaximoMeses', 'frecuenciaPago',
        'metodoAmortizacion', 'porcentajeMora', 'cargoCierre', 'porcentajeCargoCierre', 'diasGracia',
        'requiereGarantia', 'requiereGarante', 'motorConfig',
      ]);
      fila.motorConfig = fila.motorConfig ? JSON.parse(fila.motorConfig) : null;
      return [fila];
    }
    if (sql.includes('INSERT INTO pr_solicitudes')) {
      return [this.insertarDesdeInsert('pr_solicitudes', sql, params, [
        'empresaId', 'numero', 'deudorId', 'productoId', 'montoSolicitado', 'plazoMeses',
        'frecuenciaPago', 'proposito', 'oficialId', 'oficialNombre', 'fechaSolicitud', 'ingresoMensual',
        'gastosMensuales', 'capacidadPago', 'estado', 'observaciones', 'creadoPor',
      ])];
    }
    if (sql.includes('INSERT INTO pr_prestamos')) {
      const cols = this.columnasDeInsert(sql);
      const fila = this.insertarDesdeInsert('pr_prestamos', sql, params, cols);
      fila.motorConfig = fila.motorConfig ? JSON.parse(fila.motorConfig) : null;
      return [fila];
    }
    if (sql.includes('INSERT INTO pr_cuotas')) {
      const cols = this.columnasDeInsert(sql);
      const fila = this.insertarDesdeInsert('pr_cuotas', sql, params, cols);
      fila.cargos = fila.cargos ? JSON.parse(fila.cargos) : null;
      fila.capitalPagado = 0; fila.interesPagado = 0; fila.moraGenerada = 0; fila.moraPagada = 0;
      fila.cargosPagados = 0; fila.totalPagado = 0; fila.estado = 'pendiente'; fila.diasMora = 0;
      return [fila];
    }
    if (sql.includes('INSERT INTO pr_pagos')) {
      const cols = this.columnasDeInsert(sql);
      const fila = this.insertarDesdeInsert('pr_pagos', sql, params, cols);
      fila.cuotasAfectadas = fila.cuotasAfectadas ? JSON.parse(fila.cuotasAfectadas) : [];
      return [fila];
    }

    // SELECTs puntuales
    if (sql.includes('SELECT 1 FROM pr_deudores')) {
      const [id, empresaId] = params;
      return this.tablas.pr_deudores.some(d => d.id === id && d.empresaId === empresaId) ? [{ x: 1 }] : [];
    }
    if (sql.includes('FROM pr_solicitudes') && sql.includes('FOR UPDATE') && !sql.includes('JOIN')) {
      const [id, empresaId] = params;
      const fila = this.tablas.pr_solicitudes.find(s => s.id === id && s.empresaId === empresaId);
      return fila ? [fila] : [];
    }
    if (sql.includes('FROM pr_solicitudes s') && sql.includes('JOIN pr_deudores')) {
      // orFail de SolicitudesService: WHERE s.id=$1 AND s."empresaId"=$2
      const [id, empresaId] = params;
      const fila = this.tablas.pr_solicitudes.find(s => s.id === id && s.empresaId === empresaId);
      return fila ? [{ ...fila, deudorNombre: 'Deudor Test' }] : [];
    }
    if (sql.includes('UPDATE pr_solicitudes SET estado=$1')) {
      // decidir()
      const [estado, montoAprobado, tasaAprobada, decididoPor, motivoRechazo, id, empresaId] = params;
      const fila = this.tablas.pr_solicitudes.find(s => s.id === id && s.empresaId === empresaId)!;
      Object.assign(fila, { estado, montoAprobado, tasaAprobada, decididoPor, motivoRechazo });
      return [fila];
    }
    if (sql.includes(`UPDATE pr_solicitudes SET estado='desembolsada'`)) {
      const [id, empresaId] = params;
      const fila = this.tablas.pr_solicitudes.find(s => s.id === id && s.empresaId === empresaId);
      if (fila) fila.estado = 'desembolsada';
      return [];
    }
    if (sql.includes('FROM pr_productos_prestamo WHERE id=')) {
      const [id, empresaId] = params;
      const fila = this.tablas.pr_productos_prestamo.find(p => p.id === id && p.empresaId === empresaId);
      return fila ? [fila] : [];
    }
    if (sql.includes('FROM pr_prestamos') && sql.includes('WHERE id=$1 AND "empresaId"=$2') && !sql.includes('JOIN')) {
      const [id, empresaId] = params;
      const fila = this.tablas.pr_prestamos.find(p => p.id === id && p.empresaId === empresaId);
      return fila ? [fila] : [];
    }
    if (sql.includes('FROM pr_prestamos p') && sql.includes('JOIN pr_deudores')) {
      // orFail de PrestamosService (findOne)
      const [id, empresaId] = params;
      const fila = this.tablas.pr_prestamos.find(p => p.id === id && p.empresaId === empresaId);
      return fila ? [{ ...fila, deudorNombre: 'Deudor Test' }] : [];
    }
    if (sql.includes('FROM pr_cuotas WHERE "prestamoId"=$1') && sql.includes('FOR UPDATE')) {
      const [prestamoId] = params;
      return this.tablas.pr_cuotas.filter(c => c.prestamoId === prestamoId && c.estado !== 'pagada')
        .sort((a, b) => a.numeroCuota - b.numeroCuota);
    }
    if (sql.includes('FROM pr_cuotas WHERE "prestamoId"=$1 ORDER BY "numeroCuota"')) {
      const [prestamoId] = params;
      return this.tablas.pr_cuotas.filter(c => c.prestamoId === prestamoId).sort((a, b) => a.numeroCuota - b.numeroCuota);
    }
    if (sql.includes('FROM pr_pagos WHERE "prestamoId"=$1')) {
      const [prestamoId] = params;
      return this.tablas.pr_pagos.filter(p => p.prestamoId === prestamoId);
    }
    if (sql.includes('SUM(GREATEST(0, capital')) {
      // recalcular saldos (PagosService.registrar)
      const [prestamoId] = params;
      const cuotas = this.tablas.pr_cuotas.filter(c => c.prestamoId === prestamoId);
      const saldoCapital = cuotas.reduce((a, c) => a + Math.max(0, c.capital - c.capitalPagado), 0);
      const saldoInteres = cuotas.reduce((a, c) => a + Math.max(0, c.interes - c.interesPagado), 0);
      const saldoMora    = cuotas.reduce((a, c) => a + Math.max(0, c.moraGenerada - c.moraPagada), 0);
      const cuotasPendientes = cuotas.filter(c => c.estado !== 'pagada').length;
      const cuotasVencidas = cuotas.filter(c => c.estado !== 'pagada' && c.fechaVencimiento < '2099-01-01' && false).length; // nunca vencidas en este test (fechas futuras)
      const maxDiasMora = 0;
      return [{ saldoCapital, saldoInteres, saldoMora, cuotasPendientes, cuotasVencidas, maxDiasMora }];
    }

    // UPDATEs de cuotas/préstamos/deudores
    if (sql.includes('UPDATE pr_cuotas SET "interesPagado"=$1')) {
      const [interesPagado, capitalPagado, moraPagada, totalPagado, cargosPagados, estado, fechaPago, id] = params;
      const fila = this.tablas.pr_cuotas.find(c => c.id === id)!;
      Object.assign(fila, { interesPagado, capitalPagado, moraPagada, totalPagado, cargosPagados, estado, fechaPago });
      return [];
    }
    if (sql.includes('UPDATE pr_prestamos SET "saldoCapital"=$1')) {
      const [saldoCapital, saldoInteres, saldoMora, saldoTotal, totalPagado, cuotasVencidas, estado, id] = params;
      const fila = this.tablas.pr_prestamos.find(p => p.id === id)!;
      Object.assign(fila, { saldoCapital, saldoInteres, saldoMora, saldoTotal, totalPagado, cuotasVencidas, estado });
      return [];
    }
    if (sql.includes('UPDATE pr_deudores')) return [];

    // Reemplazo de cuotas 100% pendientes (abono_extraordinario_capital /
    // destinoExcedente='capital') — ver aplicarAbonoExtraordinario().
    if (sql.includes('DELETE FROM pr_cuotas WHERE id = ANY($1)')) {
      const [ids] = params;
      this.tablas.pr_cuotas = this.tablas.pr_cuotas.filter(c => !ids.includes(c.id));
      return [];
    }

    return [];
  };

  private columnasDeInsert(sql: string): string[] {
    const dentro = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')'));
    return dentro.split(',').map(c => c.trim().replace(/"/g, ''));
  }

  private insertarDesdeInsert(tabla: string, sql: string, params: any[], columnasFallback: string[]): Fila {
    const columnas = sql.includes('(') ? this.columnasDeInsert(sql) : columnasFallback;
    const fila: Fila = { id: this.siguienteId(tabla) };
    columnas.forEach((col, i) => { fila[col] = params[i]; });
    this.tablas[tabla].push(fila);
    return fila;
  }
}

function construirServicios(db: BaseEnMemoria) {
  const dsLike = { query: db.query, createQueryRunner: () => qr };
  const qr = {
    connect: async () => {}, startTransaction: async () => {}, commitTransaction: async () => {},
    rollbackTransaction: async () => {}, release: async () => {}, query: db.query, manager: {},
  };
  const asientosMock = {
    asientoDesembolsoPrestamo: jest.fn().mockResolvedValue(undefined),
    asientoPagoPrestamo: jest.fn().mockResolvedValue(undefined),
  };
  const tenantSvc = { getUserId: () => 1, getEmpresaId: () => 1 };
  const feriadosSvc = { obtenerSetFeriados: jest.fn().mockResolvedValue(new Set<string>()) };
  const emitirEcf = { execute: jest.fn().mockResolvedValue(undefined) };

  return {
    productos: new ProductosPrestamoService(dsLike as any),
    solicitudes: new SolicitudesService(dsLike as any, tenantSvc as any),
    prestamos: new PrestamosService(dsLike as any, asientosMock as any, tenantSvc as any, feriadosSvc as any),
    pagos: new PagosService(dsLike as any, asientosMock as any, emitirEcf as any, tenantSvc as any, feriadosSvc as any),
  };
}

const EMPRESA = 1;
const DEUDOR = 1;

/**
 * Paga una cuota a la vez, el monto EXACTO que le falta a la más vieja
 * pendiente, hasta que el préstamo quede en 'pagado'. Si algo en la cadena
 * de cálculo quedó mal (capital que no cierra, cargos sin aplicar), esto
 * nunca termina en 'pagado' o lanza.
 */
async function pagarHastaSaldoCero(pagos: PagosService, prestamoId: number, db: BaseEnMemoria) {
  for (let intento = 0; intento < 50; intento++) {
    const prestamo = db.tablas.pr_prestamos.find(p => p.id === prestamoId)!;
    if (prestamo.estado === 'pagado') return prestamo;
    const cuota = db.tablas.pr_cuotas
      .filter(c => c.prestamoId === prestamoId && c.estado !== 'pagada')
      .sort((a, b) => a.numeroCuota - b.numeroCuota)[0];
    if (!cuota) return prestamo;
    const cargosTotal = Array.isArray(cuota.cargos) ? cuota.cargos.reduce((a: number, c: any) => a + Number(c.monto), 0) : 0;
    const montoPagado = Number(cuota.capital) + Number(cuota.interes) + cargosTotal
      - Number(cuota.capitalPagado) - Number(cuota.interesPagado) - Number(cuota.cargosPagados ?? 0);
    if (montoPagado <= 0) throw new Error(`Cuota #${cuota.numeroCuota} sin pendiente — bucle infinito`);
    await pagos.registrar(EMPRESA, { prestamoId, montoPagado: Math.round(montoPagado * 100) / 100, tipoPago: 'abono_parcial' });
  }
  throw new Error('No llegó a saldo cero en 50 intentos — revisar la cadena de cálculo/pago');
}

describe('Fase 2B — punto 9: producto → solicitud → aprobación → desembolso → pagos → saldo cero (todas las frecuencias)', () => {
  const casos: Array<{ nombre: string; motorConfig: any; plazoMeses: number; fechaPrimerPago: string }> = [
    {
      nombre: 'mensual (francés)', plazoMeses: 6, fechaPrimerPago: '2026-11-01',
      motorConfig: { frecuencia: 'mensual', tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'frances' },
    },
    {
      nombre: 'semanal (alemán)', plazoMeses: 8, fechaPrimerPago: '2026-10-16',
      motorConfig: { frecuencia: 'semanal', tasa: { valor: 0.01, periodoExpresado: 'semanal', tipo: 'nominal', baseDias: 360 }, metodo: 'aleman' },
    },
    {
      nombre: 'quincenal cada_15_dias (flat)', plazoMeses: 10, fechaPrimerPago: '2026-10-16',
      motorConfig: { frecuencia: 'quincenal', frecuenciaQuincenal: { modo: 'cada_15_dias' }, tasa: { valor: 0.015, periodoExpresado: 'quincenal', tipo: 'nominal', baseDias: 360 }, metodo: 'flat' },
    },
    {
      nombre: 'quincenal dias_fijos (francés)', plazoMeses: 4, fechaPrimerPago: '2026-10-15',
      motorConfig: { frecuencia: 'quincenal', frecuenciaQuincenal: { modo: 'dias_fijos' }, tasa: { valor: 0.015, periodoExpresado: 'quincenal', tipo: 'nominal', baseDias: 360 }, metodo: 'frances' },
    },
    {
      nombre: 'bimestral (americano)', plazoMeses: 3, fechaPrimerPago: '2026-12-01',
      motorConfig: { frecuencia: 'bimestral', tasa: { valor: 0.06, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'americano' },
    },
    {
      nombre: 'trimestral (francés)', plazoMeses: 4, fechaPrimerPago: '2027-01-01',
      motorConfig: { frecuencia: 'trimestral', tasa: { valor: 0.09, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'frances' },
    },
    {
      nombre: 'semestral (alemán)', plazoMeses: 2, fechaPrimerPago: '2027-04-01',
      motorConfig: { frecuencia: 'semestral', tasa: { valor: 0.18, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'aleman' },
    },
    {
      nombre: 'anual (flat)', plazoMeses: 2, fechaPrimerPago: '2027-10-01',
      motorConfig: { frecuencia: 'anual', tasa: { valor: 0.36, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'flat' },
    },
    {
      nombre: 'diaria con exclusión de domingos (francés)', plazoMeses: 20, fechaPrimerPago: '2026-10-10',
      motorConfig: { frecuencia: 'diaria', frecuenciaDiaria: { excluirDomingos: true, excluirFeriados: false }, tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'frances' },
    },
    {
      nombre: 'único (bullet por días reales)', plazoMeses: 1, fechaPrimerPago: '2026-12-15',
      motorConfig: { frecuencia: 'unico', tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'frances' },
    },
    {
      nombre: 'mensual con gracia de capital + cargo por cuota', plazoMeses: 6, fechaPrimerPago: '2026-11-01',
      motorConfig: {
        frecuencia: 'mensual', tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'frances',
        gracia: { tipo: 'capital', periodos: 2 },
        cargos: [{ concepto: 'Seguro', tipo: 'fijo', monto: 100, momento: 'por_cuota' }],
      },
    },
  ];

  for (const caso of casos) {
    it(`${caso.nombre}: el préstamo termina en 'pagado' con saldoCapital=0`, async () => {
      const db = new BaseEnMemoria();
      const { productos, solicitudes, prestamos, pagos } = construirServicios(db);

      const producto = await productos.create(EMPRESA, { nombre: `Producto ${caso.nombre}`, tasaInteresMensual: 3, motorConfig: caso.motorConfig });

      const solicitud = await solicitudes.create(EMPRESA, {
        deudorId: DEUDOR, productoId: producto.id, montoSolicitado: 50000, plazoMeses: caso.plazoMeses,
      });
      expect(solicitud.estado).toBe('pendiente');

      // decidir() valida que el aprobador no sea el creador — el test corre
      // como otro usuario (99) para la decisión.
      const dsOtroUsuario = construirServicios(db);
      (dsOtroUsuario.solicitudes as any).tenantSvc = { getUserId: () => 99 };
      const solicitudesComoOtro = new SolicitudesService(
        { query: db.query } as any,
        { getUserId: () => 99 } as any,
      );
      const decidida = await solicitudesComoOtro.decidir(EMPRESA, solicitud.id, { decision: 'aprobada', montoAprobado: 50000 });
      expect(decidida.estado).toBe('aprobada');

      const desembolso = await prestamos.create(EMPRESA, {
        solicitudId: solicitud.id, fechaDesembolso: '2026-10-01', fechaPrimerPago: caso.fechaPrimerPago,
      });
      expect(desembolso.motorVersion).toBe('v2');
      expect(desembolso.cuotas.length).toBeGreaterThan(0);

      const final = await pagarHastaSaldoCero(pagos, desembolso.id, db);
      expect(final.estado).toBe('pagado');
      expect(Number(final.saldoCapital)).toBe(0);
      expect(db.tablas.pr_cuotas.filter(c => c.prestamoId === desembolso.id).every(c => c.estado === 'pagada')).toBe(true);
    });
  }
});

async function crearPrestamoMensualDePrueba(plazoMeses = 4) {
  const db = new BaseEnMemoria();
  const { productos, solicitudes, prestamos, pagos } = construirServicios(db);
  const producto = await productos.create(EMPRESA, {
    nombre: 'Producto mensual prueba', tasaInteresMensual: 3,
    motorConfig: { frecuencia: 'mensual', tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'frances' },
  });
  const solicitud = await solicitudes.create(EMPRESA, { deudorId: DEUDOR, productoId: producto.id, montoSolicitado: 40000, plazoMeses });
  const solicitudesComoOtro = new SolicitudesService({ query: db.query } as any, { getUserId: () => 99 } as any);
  await solicitudesComoOtro.decidir(EMPRESA, solicitud.id, { decision: 'aprobada', montoAprobado: 40000 });
  const desembolso = await prestamos.create(EMPRESA, { solicitudId: solicitud.id, fechaDesembolso: '2026-10-01', fechaPrimerPago: '2026-11-01' });
  return { db, pagos, desembolso };
}

describe('Registrar Pago (precursor de Etapa 2) — tipos de pago contra servicios reales', () => {
  it('tipoPago=cuotas paga las cuotas seleccionadas en orden, sin saltar ninguna', async () => {
    const { db, pagos, desembolso } = await crearPrestamoMensualDePrueba(4);
    const [c1, c2] = desembolso.cuotas;
    const montoNecesario = Number(c1.cuotaTotal) + Number(c2.cuotaTotal);
    const res = await pagos.registrar(EMPRESA, {
      prestamoId: desembolso.id, montoPagado: montoNecesario, tipoPago: 'cuotas', cuotasSeleccionadas: [c1.id, c2.id],
    });
    expect(res.cuotasAfectadas).toHaveLength(2);
    expect(db.tablas.pr_cuotas.find((c: any) => c.id === c1.id)!.estado).toBe('pagada');
    expect(db.tablas.pr_cuotas.find((c: any) => c.id === c2.id)!.estado).toBe('pagada');
  });

  it('tipoPago=cuotas rechaza una selección que salta la cuota más vieja pendiente', async () => {
    const { pagos, desembolso } = await crearPrestamoMensualDePrueba(4);
    const [, c2] = desembolso.cuotas;
    await expect(pagos.registrar(EMPRESA, {
      prestamoId: desembolso.id, montoPagado: Number(c2.cuotaTotal), tipoPago: 'cuotas', cuotasSeleccionadas: [c2.id],
    })).rejects.toThrow(/en orden/);
  });

  it('tipoPago=abono_parcial aplica a la cuota más vieja sin exigir selección, puede quedar parcial', async () => {
    const { db, pagos, desembolso } = await crearPrestamoMensualDePrueba(4);
    const [c1] = desembolso.cuotas;
    const mitad = Math.round((Number(c1.cuotaTotal) / 2) * 100) / 100;
    await pagos.registrar(EMPRESA, { prestamoId: desembolso.id, montoPagado: mitad, tipoPago: 'abono_parcial' });
    const cuota = db.tablas.pr_cuotas.find((c: any) => c.id === c1.id)!;
    expect(cuota.estado).toBe('parcial');
    expect(Number(cuota.interesPagado) + Number(cuota.capitalPagado)).toBeCloseTo(mitad, 1);
  });

  it('tipoPago=liquidar exige el monto EXACTO y, con ese monto, deja el préstamo en pagado', async () => {
    const { db, pagos, desembolso } = await crearPrestamoMensualDePrueba(3);
    const totalExacto = desembolso.cuotas.reduce((a: number, c: any) => a + Number(c.capital) + Number(c.interes), 0);

    await expect(pagos.registrar(EMPRESA, {
      prestamoId: desembolso.id, montoPagado: totalExacto - 100, tipoPago: 'liquidar', fecha: '2026-10-01',
    })).rejects.toThrow(/monto exacto/);

    const res = await pagos.registrar(EMPRESA, {
      prestamoId: desembolso.id, montoPagado: Math.round(totalExacto * 100) / 100, tipoPago: 'liquidar', fecha: '2026-10-01',
    });
    expect((res.saldos as any).saldoCapital).toBe(0);
    expect(db.tablas.pr_prestamos.find((p: any) => p.id === desembolso.id)!.estado).toBe('pagado');
  });

  it('destinoExcedente=capital: el excedente de la cuota 1 recalcula la tabla restante en vez de pasar a la cuota 2', async () => {
    const { db, pagos, desembolso } = await crearPrestamoMensualDePrueba(4);
    const [c1] = desembolso.cuotas;
    const cuotaOriginalRestante = desembolso.cuotas[1].cuotaTotal;
    const extra = 5000;
    const montoPagado = Number(c1.cuotaTotal) + extra;

    await pagos.registrar(EMPRESA, {
      prestamoId: desembolso.id, montoPagado, tipoPago: 'cuotas', cuotasSeleccionadas: [c1.id], destinoExcedente: 'capital',
    });

    const pendientes = db.tablas.pr_cuotas
      .filter((c: any) => c.prestamoId === desembolso.id && c.estado !== 'pagada')
      .sort((a: any, b: any) => a.numeroCuota - b.numeroCuota);
    expect(pendientes).toHaveLength(3); // mismo plazo restante — reducir_cuota es el default
    expect(Number(pendientes[0].cuotaTotal)).toBeLessThan(Number(cuotaOriginalRestante));
  });
});
