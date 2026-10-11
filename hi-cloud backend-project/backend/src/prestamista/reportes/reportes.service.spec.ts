/**
 * Etapa 4 — Cartera e indicadores. `reportes.service.ts` (12 endpoints CSV)
 * no tenía NINGÚN test — la auditoría de esta etapa lo confirmó. Mismo
 * patrón que cobranza.service.spec.ts: un `DataSource` simulado que
 * responde a las queries EXACTAS de cada método, con datos de DOS empresas
 * para probar aislamiento multi-tenant en los 12.
 *
 * Dos de los fixtures son A PROPÓSITO adversariales: reproducen el escenario
 * exacto de la fuga de tenant que se encontró y corrigió en esta etapa
 * (ver docs/prestamista/etapa-4-cartera-indicadores.md):
 *   - P101 (empresa 1) referencia `productoId=60`, que en los datos de
 *     prueba solo existe bajo la empresa 2 ("Vehicular"). Si el LEFT JOIN de
 *     `carteraActiva`/`prestamosPorProducto` contra `pr_productos_prestamo`
 *     no filtrara por empresaId, el nombre del producto de la OTRA empresa
 *     se filtraría en el reporte.
 *   - PG_LEAK es un pago con `empresaId=2` pero `prestamoId=100` (un
 *     préstamo de la empresa 1) — si el LEFT JOIN de `estadoCuentaDeudor`
 *     contra `pr_pagos` no filtrara por empresaId, ese pago ajeno
 *     aparecería en el estado de cuenta de un deudor de la empresa 1.
 */
import { ReportesPrestamistaService } from './reportes.service';

function parseCsv(csv: string): Record<string, string>[] {
  const limpio = csv.replace(/^﻿/, '');
  const [headLine, ...bodyLines] = limpio.split('\n');
  const headers = headLine.split(',');
  return bodyLines.filter(Boolean).map(line => {
    const valores = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, valores[i]]));
  });
}

function buildDs() {
  const hoy = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const pasado = fmt(new Date(hoy.getTime() - 5 * 86400_000));
  const futuro = fmt(new Date(hoy.getTime() + 10 * 86400_000));

  const productos = [
    { id: 50, empresaId: 1, nombre: 'Personal' },
    { id: 60, empresaId: 2, nombre: 'Vehicular' },
  ];
  const deudores = [
    { id: 10, empresaId: 1, nombre: 'Ana', apellidos: 'Pérez', cedula: '001-1', telefono: '8091110000', direccion: 'Calle 1', email: 'ana@test.com', nivelRiesgo: 'medio', totalPrestado: 10000, totalPagado: 4000, prestamosActivos: 1, diasMoraHistorico: 10, estado: 'activo', numero: 'D-0001' },
    { id: 20, empresaId: 2, nombre: 'Carlos', apellidos: 'Otro', cedula: '002-2', telefono: '8092220000', direccion: 'Calle 2', email: 'carlos@test.com', nivelRiesgo: 'alto', totalPrestado: 99999, totalPagado: 1, prestamosActivos: 1, diasMoraHistorico: 50, estado: 'activo', numero: 'D-0002' },
  ];
  const prestamos = [
    { id: 100, empresaId: 1, numero: 'PR-0001', deudorId: 10, productoId: 50, montoPrincipal: 5000, saldoCapital: 3000, saldoInteres: 200, saldoMora: 300, saldoTotal: 3500, estado: 'moroso', fechaDesembolso: '2026-01-01', fechaVencimiento: '2027-01-01', cuotasVencidas: 2, tasaInteresMensual: 2.5, diasMoraActual: 20, totalPagado: 2000 },
    // Adversarial: productoId=60 solo existe bajo empresa 2 — prueba el fix del JOIN.
    { id: 101, empresaId: 1, numero: 'PR-0002', deudorId: 10, productoId: 60, montoPrincipal: 2000, saldoCapital: 2000, saldoInteres: 0, saldoMora: 0, saldoTotal: 2000, estado: 'al_dia', fechaDesembolso: '2026-02-01', fechaVencimiento: '2027-02-01', cuotasVencidas: 0, tasaInteresMensual: 2.0, diasMoraActual: 0, totalPagado: 0 },
    { id: 900, empresaId: 2, numero: 'OTRA-0001', deudorId: 20, productoId: 60, montoPrincipal: 99999, saldoCapital: 99999, saldoInteres: 999, saldoMora: 9999, saldoTotal: 109998, estado: 'moroso', fechaDesembolso: '2026-01-01', fechaVencimiento: '2027-01-01', cuotasVencidas: 5, tasaInteresMensual: 3.0, diasMoraActual: 50, totalPagado: 1 },
    { id: 906, empresaId: 2, numero: 'OTRA-0002', deudorId: 20, productoId: 60, montoPrincipal: 3000, saldoCapital: 3000, saldoInteres: 0, saldoMora: 0, saldoTotal: 3000, estado: 'al_dia', fechaDesembolso: '2026-03-01', fechaVencimiento: '2027-03-01', cuotasVencidas: 0, tasaInteresMensual: 2.0, diasMoraActual: 0, totalPagado: 0 },
  ];
  const pagos = [
    { id: 200, empresaId: 1, prestamoId: 100, deudorId: 10, numero: 'PG-0001', fecha: '2026-09-01', montoPagado: 500, aplicadoCapital: 300, aplicadoInteres: 150, aplicadoMora: 50, metodoPago: 'efectivo', referencia: 'R1' },
    // Adversarial: empresaId=2 pero prestamoId=100 es un préstamo de la empresa 1 — prueba el fix del JOIN.
    { id: 201, empresaId: 2, prestamoId: 100, deudorId: 10, numero: 'PG-LEAK', fecha: '2026-09-05', montoPagado: 99999, aplicadoCapital: 99999, aplicadoInteres: 0, aplicadoMora: 0, metodoPago: 'efectivo', referencia: 'LEAK' },
    { id: 901, empresaId: 2, prestamoId: 900, deudorId: 20, numero: 'OTRA-PG', fecha: '2026-09-01', montoPagado: 99999, aplicadoCapital: 1, aplicadoInteres: 1, aplicadoMora: 1, metodoPago: 'efectivo', referencia: 'OTRA-R' },
  ];
  const cuotas = [
    { id: 300, empresaId: 1, prestamoId: 100, numeroCuota: 1, fechaVencimiento: pasado, cuotaTotal: 500, capital: 400, capitalPagado: 0, interes: 100, interesPagado: 0, estado: 'vencida', moraGenerada: 50 },
    { id: 301, empresaId: 1, prestamoId: 100, numeroCuota: 2, fechaVencimiento: futuro, cuotaTotal: 500, capital: 400, capitalPagado: 0, interes: 100, interesPagado: 0, estado: 'pendiente', moraGenerada: 0 },
    { id: 902, empresaId: 2, prestamoId: 900, numeroCuota: 1, fechaVencimiento: pasado, cuotaTotal: 50000, capital: 40000, capitalPagado: 0, interes: 10000, interesPagado: 0, estado: 'vencida', moraGenerada: 500 },
  ];
  const garantias = [
    { id: 400, empresaId: 1, deudorId: 10, prestamoId: 100, tipo: 'vehiculo', descripcion: 'Carro X', valorTasado: 8000, estado: 'activa', createdAt: '2026-01-01' },
    { id: 903, empresaId: 2, deudorId: 20, prestamoId: 900, tipo: 'inmueble', descripcion: 'Casa Otro', valorTasado: 500000, estado: 'activa', createdAt: '2026-01-01' },
  ];
  const cobranzas = [
    { id: 500, empresaId: 1, prestamoId: 100, fecha: '2026-09-10', tipo: 'llamada', resultado: 'contacto', descripcion: 'nota', proximaGestion: '2026-09-20', telefono: '8091110000' },
    { id: 904, empresaId: 2, prestamoId: 900, fecha: '2026-09-10', tipo: 'visita', resultado: 'promesa', descripcion: 'otra nota', proximaGestion: '2026-09-20', telefono: '8092220000' },
  ];
  const refinanciamientos = [
    { id: 600, empresaId: 1, prestamoOriginalId: 100, prestamoNuevoId: 101, fecha: '2026-08-01', montoNuevo: 2000, nuevoPlazo: 12, nuevaTasa: 2.0, motivo: 'ajuste' },
    { id: 905, empresaId: 2, prestamoOriginalId: 900, prestamoNuevoId: 906, fecha: '2026-08-05', montoNuevo: 3000, nuevoPlazo: 12, nuevaTasa: 2.0, motivo: 'ajuste otra' },
  ];

  const porEmpresa = <T extends { empresaId: number }>(arr: T[], empresaId: number) => arr.filter(x => x.empresaId === empresaId);
  const nombreDeudor = (d: any) => `${d.nombre} ${d.apellidos ?? ''}`.trim();

  const query = jest.fn(async (sql: string, params: any[] = []): Promise<any[]> => {
    const empresaId = params[0];

    if (sql.includes('p."tasaInteresMensual"')) {
      return porEmpresa(prestamos, empresaId)
        .filter(p => !['cancelado', 'refinanciado'].includes(p.estado))
        .map(p => {
          const d = deudores.find(x => x.id === p.deudorId)!;
          const prod = productos.find(x => x.id === p.productoId && x.empresaId === p.empresaId);
          return { numero: p.numero, deudor: nombreDeudor(d), cedula: d.cedula, producto: prod?.nombre ?? null, ...p };
        });
    }
    if (sql.includes('AS rangomora')) {
      const rango = (dias: number) =>
        dias === 0 ? 'Sin mora' : dias <= 30 ? '1-30 días' : dias <= 60 ? '31-60 días' : dias <= 90 ? '61-90 días' : '+90 días';
      return porEmpresa(prestamos, empresaId)
        .filter(p => ['moroso', 'vencido', 'al_dia'].includes(p.estado))
        .map(p => {
          const d = deudores.find(x => x.id === p.deudorId)!;
          return { numero: p.numero, deudor: nombreDeudor(d), telefono: d.telefono, rangomora: rango(p.diasMoraActual), ...p };
        });
    }
    if (sql.includes('FROM pr_pagos pg')) {
      const desde = params[1]; const hasta = params[2];
      return pagos
        .filter(pg => pg.empresaId === empresaId)
        .filter(pg => !desde || pg.fecha >= desde)
        .filter(pg => !hasta || pg.fecha <= hasta)
        .map(pg => {
          const pr = prestamos.find(x => x.id === pg.prestamoId && x.empresaId === pg.empresaId)!;
          const d = deudores.find(x => x.id === pg.deudorId && x.empresaId === pg.empresaId)!;
          return { numero: pg.numero, fecha: pg.fecha, deudor: nombreDeudor(d), prestamo: pr.numero, montoPagado: pg.montoPagado, aplicadoCapital: pg.aplicadoCapital, aplicadoInteres: pg.aplicadoInteres, aplicadoMora: pg.aplicadoMora, metodoPago: pg.metodoPago, referencia: pg.referencia };
        });
    }
    if (sql.includes('"estadoCuota"')) {
      const dias = params[1];
      const limite = fmt(new Date(hoy.getTime() + Number(dias) * 86400_000));
      return cuotas
        .filter(c => c.empresaId === empresaId && ['pendiente', 'vencida'].includes(c.estado))
        .filter(c => c.fechaVencimiento >= fmt(hoy) && c.fechaVencimiento <= limite)
        .map(c => {
          const p = prestamos.find(x => x.id === c.prestamoId && x.empresaId === empresaId)!;
          const d = deudores.find(x => x.id === p.deudorId && x.empresaId === empresaId)!;
          return { numeroCuota: c.numeroCuota, fechaVencimiento: c.fechaVencimiento, cuotaTotal: c.cuotaTotal, capitalPend: Math.max(0, c.capital - c.capitalPagado), interesPend: Math.max(0, c.interes - c.interesPagado), estadoCuota: c.estado, prestamo: p.numero, deudor: nombreDeudor(d), telefono: d.telefono };
        });
    }
    if (sql.includes('GROUP BY pr.nombre')) {
      const propios = porEmpresa(prestamos, empresaId);
      const porProducto = new Map<string, any[]>();
      for (const p of propios) {
        const prod = productos.find(x => x.id === p.productoId && x.empresaId === p.empresaId);
        const nombre = prod?.nombre ?? null;
        porProducto.set(nombre as any, [...(porProducto.get(nombre as any) ?? []), p]);
      }
      return [...porProducto.entries()].map(([producto, lista]) => ({
        producto,
        totalPrestamos: lista.length,
        capitalTotal: lista.reduce((a, p) => a + p.montoPrincipal, 0),
        saldoTotal: lista.reduce((a, p) => a + p.saldoCapital, 0),
        moraTotal: lista.reduce((a, p) => a + p.saldoMora, 0),
        alDia: lista.filter(p => p.estado === 'al_dia').length,
        morosos: lista.filter(p => p.estado === 'moroso').length,
        vencidos: lista.filter(p => p.estado === 'vencido').length,
        pagados: lista.filter(p => p.estado === 'pagado').length,
      })).sort((a, b) => b.capitalTotal - a.capitalTotal);
    }
    if (sql.includes('FROM pr_garantias g')) {
      return porEmpresa(garantias, empresaId).map(g => {
        const d = deudores.find(x => x.id === g.deudorId && x.empresaId === empresaId)!;
        const p = prestamos.find(x => x.id === g.prestamoId && x.empresaId === empresaId);
        return { tipo: g.tipo, descripcion: g.descripcion, valorTasado: g.valorTasado, estado: g.estado, fechaRegistro: g.createdAt, prestamo: p?.numero ?? null, deudor: nombreDeudor(d) };
      });
    }
    if (sql.includes('FROM pr_cobranzas c')) {
      const desde = params[1]; const hasta = params[2];
      return cobranzas
        .filter(c => c.empresaId === empresaId)
        .filter(c => !desde || c.fecha >= desde)
        .filter(c => !hasta || c.fecha <= hasta)
        .map(c => {
          const p = prestamos.find(x => x.id === c.prestamoId && x.empresaId === empresaId)!;
          const d = deudores.find(x => x.id === p.deudorId && x.empresaId === empresaId)!;
          return { fecha: c.fecha, tipo: c.tipo, resultado: c.resultado, descripcion: c.descripcion, proximaGestion: c.proximaGestion, prestamo: p.numero, deudor: nombreDeudor(d), telefono: d.telefono };
        });
    }
    if (sql.includes("d.estado='activo'")) {
      return porEmpresa(deudores, empresaId).map(d => ({ numero: d.numero, deudor: nombreDeudor(d), cedula: d.cedula, telefono: d.telefono, nivelRiesgo: d.nivelRiesgo, totalPrestado: d.totalPrestado, totalPagado: d.totalPagado, prestamosActivos: d.prestamosActivos, diasMoraHistorico: d.diasMoraHistorico }));
    }
    if (sql.includes('FROM pr_refinanciamientos r')) {
      return porEmpresa(refinanciamientos, empresaId).map(r => {
        const po = prestamos.find(x => x.id === r.prestamoOriginalId && x.empresaId === empresaId)!;
        const pn = prestamos.find(x => x.id === r.prestamoNuevoId && x.empresaId === empresaId)!;
        const d = deudores.find(x => x.id === po.deudorId && x.empresaId === empresaId)!;
        return { fecha: r.fecha, deudor: nombreDeudor(d), prestamoOriginal: po.numero, prestamoNuevo: pn.numero, montoNuevo: r.montoNuevo, nuevoPlazo: r.nuevoPlazo, nuevaTasa: r.nuevaTasa, motivo: r.motivo };
      });
    }
    if (sql.includes('totalParaIndice')) {
      const propios = porEmpresa(prestamos, empresaId);
      const totalActivos = propios.filter(p => !['cancelado', 'refinanciado'].includes(p.estado)).length;
      const totalParaIndice = propios.filter(p => !['pagado', 'cancelado'].includes(p.estado)).length;
      const morosos = propios.filter(p => p.estado === 'moroso').length;
      const vencidos = propios.filter(p => p.estado === 'vencido').length;
      const activosParaCartera = propios.filter(p => !['cancelado', 'refinanciado', 'pagado'].includes(p.estado));
      const activosParaSaldo = propios.filter(p => !['cancelado', 'refinanciado'].includes(p.estado));
      return [{
        totalActivos, totalParaIndice, alDia: propios.filter(p => p.estado === 'al_dia').length,
        morosos, vencidos, pagados: propios.filter(p => p.estado === 'pagado').length,
        carteraActiva: activosParaCartera.reduce((a, p) => a + p.montoPrincipal, 0),
        saldoCapitalTotal: activosParaSaldo.reduce((a, p) => a + p.saldoCapital, 0),
        moraTotal: activosParaSaldo.reduce((a, p) => a + p.saldoMora, 0),
        recaudadoTotal: propios.reduce((a, p) => a + p.totalPagado, 0),
      }];
    }
    if (sql.includes('"diasVencida"')) {
      return cuotas
        .filter(c => c.empresaId === empresaId && ['vencida', 'parcial'].includes(c.estado) && c.fechaVencimiento < fmt(hoy))
        .map(c => {
          const p = prestamos.find(x => x.id === c.prestamoId && x.empresaId === empresaId)!;
          const d = deudores.find(x => x.id === p.deudorId && x.empresaId === empresaId)!;
          const dias = Math.round((hoy.getTime() - new Date(c.fechaVencimiento).getTime()) / 86400_000);
          return { prestamo: p.numero, deudor: nombreDeudor(d), telefono: d.telefono, numeroCuota: c.numeroCuota, fechaVencimiento: c.fechaVencimiento, diasVencida: dias, capitalPend: Math.max(0, c.capital - c.capitalPagado), interesPend: Math.max(0, c.interes - c.interesPagado), mora: c.moraGenerada };
        });
    }
    if (sql.includes('LEFT JOIN pr_pagos pg')) {
      const deudorId = params[1];
      const propios = prestamos.filter(p => p.empresaId === empresaId && p.deudorId === deudorId);
      const filas: any[] = [];
      for (const p of propios) {
        const pagosDelPrestamo = pagos.filter(pg => pg.prestamoId === p.id && pg.empresaId === p.empresaId);
        if (pagosDelPrestamo.length === 0) {
          filas.push({ prestamo: p.numero, estadoPrestamo: p.estado, montoPrincipal: p.montoPrincipal, saldoCapital: p.saldoCapital, saldoMora: p.saldoMora, fechaDesembolso: p.fechaDesembolso, fechaVencimiento: p.fechaVencimiento, pago: null, fechaPago: null, montoPagado: null, aplicadoCapital: null, aplicadoInteres: null, aplicadoMora: null });
        }
        for (const pg of pagosDelPrestamo) {
          filas.push({ prestamo: p.numero, estadoPrestamo: p.estado, montoPrincipal: p.montoPrincipal, saldoCapital: p.saldoCapital, saldoMora: p.saldoMora, fechaDesembolso: p.fechaDesembolso, fechaVencimiento: p.fechaVencimiento, pago: pg.numero, fechaPago: pg.fecha, montoPagado: pg.montoPagado, aplicadoCapital: pg.aplicadoCapital, aplicadoInteres: pg.aplicadoInteres, aplicadoMora: pg.aplicadoMora });
        }
      }
      return filas;
    }
    return [];
  });

  const svc = new ReportesPrestamistaService({ query } as any);
  return { svc, query };
}

describe('ReportesPrestamistaService — 12 endpoints, aislamiento multi-tenant (Etapa 4)', () => {
  it('carteraActiva: solo préstamos de la empresa, y el producto de OTRA empresa NUNCA se filtra por el JOIN', async () => {
    const { svc } = buildDs();
    const csv = await svc.carteraActiva(1, {});
    const filas = parseCsv(csv);
    expect(filas).toHaveLength(2);
    expect(csv).not.toContain('OTRA-0001');
    expect(csv).not.toContain('Carlos');
    // PR-0002 referencia un producto que solo existe bajo la empresa 2 ("Vehicular")
    // — el fix del JOIN debe dejarlo vacío, nunca filtrar el nombre ajeno.
    const fila2 = filas.find(f => f['N° Préstamo'] === 'PR-0002')!;
    expect(fila2.Producto).toBe('');
    expect(csv).not.toContain('Vehicular');
  });

  it('carteraMora: clasifica por rango de días y aísla por empresa', async () => {
    const { svc } = buildDs();
    const csv = await svc.carteraMora(1, {});
    const filas = parseCsv(csv);
    expect(filas).toHaveLength(2);
    const moroso = filas.find(f => f['N° Préstamo'] === 'PR-0001')!;
    expect(moroso['Rango Mora']).toBe('1-30 días');
    expect(csv).not.toContain('OTRA-0001');
  });

  it('flujoCobros: filtra por período y nunca mezcla pagos de otra empresa', async () => {
    const { svc } = buildDs();
    const csv = await svc.flujoCobros(1, {});
    expect(csv).toContain('PG-0001');
    expect(csv).not.toContain('OTRA-PG');
    expect(csv).not.toContain('99999');

    const csvFiltrado = await svc.flujoCobros(1, { desde: '2026-09-02', hasta: '2026-09-30' });
    expect(csvFiltrado).not.toContain('PG-0001');
  });

  it('proyeccionCobros: respeta el parámetro "dias" y aísla por empresa', async () => {
    const { svc } = buildDs();
    const csv7 = await svc.proyeccionCobros(1, { dias: 7 });
    expect(csv7).not.toContain('PR-0001');

    const csv30 = await svc.proyeccionCobros(1, { dias: 30 });
    expect(csv30).toContain('PR-0001');
    expect(csv30).not.toContain('OTRA-0001');
  });

  it('prestamosPorProducto: agrupa por producto y el producto ajeno nunca aparece (mismo JOIN corregido que carteraActiva)', async () => {
    const { svc } = buildDs();
    const csv = await svc.prestamosPorProducto(1);
    expect(csv).toContain('Personal');
    expect(csv).not.toContain('Vehicular');
    const filas = parseCsv(csv);
    expect(filas.reduce((a, f) => a + Number(f['Total Préstamos']), 0)).toBe(2);
  });

  it('garantias: solo las de la empresa, nunca la de otra', async () => {
    const { svc } = buildDs();
    const csv = await svc.garantias(1);
    expect(csv).toContain('Carro X');
    expect(csv).not.toContain('Casa Otro');
  });

  it('gestiones: filtra por período y aísla por empresa', async () => {
    const { svc } = buildDs();
    const csv = await svc.gestiones(1, {});
    expect(csv).toContain('contacto');
    expect(csv).not.toContain('promesa');
    expect(csv).not.toContain('Carlos');
  });

  it('deudoresSaldos: solo deudores activos de la empresa', async () => {
    const { svc } = buildDs();
    const csv = await svc.deudoresSaldos(1);
    expect(csv).toContain('Ana');
    expect(csv).not.toContain('Carlos');
  });

  it('refinanciamientos: cruza préstamo original/nuevo solo dentro de la misma empresa', async () => {
    const { svc } = buildDs();
    const csv = await svc.refinanciamientos(1);
    const filas = parseCsv(csv);
    expect(filas).toHaveLength(1);
    expect(filas[0]['Préstamo Original']).toBe('PR-0001');
    expect(filas[0]['Préstamo Nuevo']).toBe('PR-0002');
    expect(csv).not.toContain('OTRA-0001');
  });

  it('indicesFinancieros: el índice de morosidad coincide con la fórmula de CobranzaService (% de activos en mora), no con mora/capital', async () => {
    const { svc } = buildDs();
    const csv = await svc.indicesFinancieros(1);
    const [fila] = parseCsv(csv);
    // 1 de 2 préstamos "para índice" (ni pagado ni cancelado) está en mora → 50.0%
    expect(fila['Índice de Morosidad (% préstamos en mora)']).toBe('50.0%');
    // mora total (300) / saldo capital total (5000) = 6.00% — métrica aparte, no el índice.
    expect(fila['Mora Acumulada / Saldo Capital (%)']).toBe('6.00%');
  });

  it('indicesFinancieros: sin préstamos no divide por cero', async () => {
    const { svc } = buildDs();
    const csv = await svc.indicesFinancieros(999);
    const [fila] = parseCsv(csv);
    expect(fila['Índice de Morosidad (% préstamos en mora)']).toBe('0.0%');
    expect(fila['Mora Acumulada / Saldo Capital (%)']).toBe('0.00%');
  });

  it('cuotasVencidas: solo cuotas ya vencidas de la empresa', async () => {
    const { svc } = buildDs();
    const csv = await svc.cuotasVencidas(1);
    const filas = parseCsv(csv);
    expect(filas).toHaveLength(1);
    expect(filas[0]['N° Préstamo']).toBe('PR-0001');
    expect(csv).not.toContain('OTRA-0001');
  });

  it('estadoCuentaDeudor: el pago de OTRA empresa sobre el MISMO préstamo nunca se filtra (fix del JOIN sin empresaId)', async () => {
    const { svc } = buildDs();
    const csv = await svc.estadoCuentaDeudor(1, 10);
    expect(csv).toContain('PG-0001');
    // PG-LEAK tiene prestamoId=100 (empresa 1) pero empresaId=2 — antes del fix
    // el LEFT JOIN sin filtro lo habría incluido en el estado de cuenta de la empresa 1.
    expect(csv).not.toContain('PG-LEAK');
    expect(csv).not.toContain('99999');
  });

  it('estadoCuentaDeudor: un deudor de otra empresa con el mismo id no devuelve nada', async () => {
    const { svc } = buildDs();
    const csv = await svc.estadoCuentaDeudor(1, 20);
    const filas = parseCsv(csv);
    expect(filas).toHaveLength(0);
  });
});
