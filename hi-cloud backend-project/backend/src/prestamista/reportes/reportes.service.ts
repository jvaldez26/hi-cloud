import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

function toCsv(rows: Record<string, any>[], headers: { key: string; label: string }[]): string {
  const escape = (v: any): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map(h => escape(h.label)).join(',');
  const body = rows.map(r => headers.map(h => escape(r[h.key])).join(',')).join('\n');
  return `﻿${head}\n${body}`;
}

@Injectable()
export class ReportesPrestamistaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // 1. Cartera activa
  async carteraActiva(empresaId: number, params: any) {
    const rows = await this.ds.query<any[]>(
      `SELECT p.numero, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor, d.cedula,
              pr.nombre AS producto, p."montoPrincipal", p."saldoCapital", p."saldoInteres",
              p."saldoMora", p."saldoTotal", p.estado, p."fechaDesembolso", p."fechaVencimiento",
              p."cuotasPagadas", p."cuotasVencidas", p."tasaInteresMensual"
         FROM pr_prestamos p
         JOIN pr_deudores d ON d.id=p."deudorId"
         LEFT JOIN pr_productos_prestamo pr ON pr.id=p."productoId"
        WHERE p."empresaId"=$1 AND p.estado NOT IN ('cancelado','refinanciado')
        ORDER BY p.estado, p."saldoTotal" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Préstamo' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'cedula', label: 'Cédula' },
      { key: 'producto', label: 'Producto' },
      { key: 'montoPrincipal', label: 'Capital Original' },
      { key: 'saldoCapital', label: 'Saldo Capital' },
      { key: 'saldoInteres', label: 'Saldo Interés' },
      { key: 'saldoMora', label: 'Saldo Mora' },
      { key: 'saldoTotal', label: 'Saldo Total' },
      { key: 'estado', label: 'Estado' },
      { key: 'fechaDesembolso', label: 'Desembolso' },
      { key: 'fechaVencimiento', label: 'Vencimiento' },
      { key: 'cuotasVencidas', label: 'Cuotas Vencidas' },
      { key: 'tasaInteresMensual', label: 'Tasa Mensual %' },
    ]);
  }

  // 2. Cartera por antigüedad de mora
  async carteraMora(empresaId: number, params: any) {
    const rows = await this.ds.query<any[]>(
      `SELECT p.numero, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor, d.telefono,
              p."saldoCapital", p."saldoMora", p."saldoTotal",
              p."diasMoraActual", p."cuotasVencidas",
              CASE WHEN p."diasMoraActual"=0 THEN 'Sin mora'
                   WHEN p."diasMoraActual"<=30 THEN '1-30 días'
                   WHEN p."diasMoraActual"<=60 THEN '31-60 días'
                   WHEN p."diasMoraActual"<=90 THEN '61-90 días'
                   ELSE '+90 días' END AS rangomora
         FROM pr_prestamos p
         JOIN pr_deudores d ON d.id=p."deudorId"
        WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido','al_dia')
        ORDER BY p."diasMoraActual" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Préstamo' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'saldoCapital', label: 'Saldo Capital' },
      { key: 'saldoMora', label: 'Saldo Mora' },
      { key: 'saldoTotal', label: 'Saldo Total' },
      { key: 'diasMoraActual', label: 'Días Mora' },
      { key: 'cuotasVencidas', label: 'Cuotas Vencidas' },
      { key: 'rangomora', label: 'Rango Mora' },
    ]);
  }

  // 3. Flujo de cobros (pagos recibidos en período)
  async flujoCobros(empresaId: number, params: any) {
    const conds: string[] = [`pg."empresaId"=$1`];
    const args: any[] = [empresaId];
    if (params.desde) { args.push(params.desde); conds.push(`pg.fecha>=$${args.length}`); }
    if (params.hasta) { args.push(params.hasta); conds.push(`pg.fecha<=$${args.length}`); }
    const rows = await this.ds.query<any[]>(
      `SELECT pg.numero, pg.fecha, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor,
              pr.numero AS prestamo, pg."montoPagado", pg."aplicadoCapital",
              pg."aplicadoInteres", pg."aplicadoMora", pg."metodoPago", pg.referencia
         FROM pr_pagos pg
         JOIN pr_prestamos pr ON pr.id=pg."prestamoId"
         JOIN pr_deudores d ON d.id=pg."deudorId"
        WHERE ${conds.join(' AND ')}
        ORDER BY pg.fecha DESC, pg.id DESC`,
      args,
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Pago' },
      { key: 'fecha', label: 'Fecha' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'prestamo', label: 'N° Préstamo' },
      { key: 'montoPagado', label: 'Total Pagado' },
      { key: 'aplicadoCapital', label: 'Capital Aplicado' },
      { key: 'aplicadoInteres', label: 'Interés Aplicado' },
      { key: 'aplicadoMora', label: 'Mora Aplicada' },
      { key: 'metodoPago', label: 'Forma de Pago' },
      { key: 'referencia', label: 'Referencia' },
    ]);
  }

  // 4. Proyección de cobros (cuotas por vencer en N días)
  async proyeccionCobros(empresaId: number, params: any) {
    const dias = Number(params.dias ?? 30);
    const rows = await this.ds.query<any[]>(
      `SELECT c."numeroCuota", c."fechaVencimiento", c."cuotaTotal",
              GREATEST(0,c.capital-c."capitalPagado") AS capitalPend,
              GREATEST(0,c.interes-c."interesPagado") AS interesPend,
              c.estado AS estadoCuota,
              p.numero AS prestamo, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor, d.telefono
         FROM pr_cuotas c
         JOIN pr_prestamos p ON p.id=c."prestamoId"
         JOIN pr_deudores d ON d.id=p."deudorId"
        WHERE c."empresaId"=$1
          AND c.estado IN ('pendiente','vencida')
          AND c."fechaVencimiento" BETWEEN CURRENT_DATE AND CURRENT_DATE+$2
        ORDER BY c."fechaVencimiento"`,
      [empresaId, dias],
    );
    return toCsv(rows, [
      { key: 'fechaVencimiento', label: 'Vencimiento' },
      { key: 'prestamo', label: 'N° Préstamo' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'numeroCuota', label: 'N° Cuota' },
      { key: 'capitalPend', label: 'Capital Pend.' },
      { key: 'interesPend', label: 'Interés Pend.' },
      { key: 'cuotaTotal', label: 'Cuota Total' },
      { key: 'estadoCuota', label: 'Estado' },
    ]);
  }

  // 5. Préstamos por producto
  async prestamosPorProducto(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT pr.nombre AS producto, COUNT(p.id) AS totalPrestamos,
              SUM(p."montoPrincipal") AS capitalTotal,
              SUM(p."saldoCapital") AS saldoTotal,
              SUM(p."saldoMora") AS moraTotal,
              COUNT(p.id) FILTER(WHERE p.estado='al_dia') AS alDia,
              COUNT(p.id) FILTER(WHERE p.estado='moroso') AS morosos,
              COUNT(p.id) FILTER(WHERE p.estado='vencido') AS vencidos,
              COUNT(p.id) FILTER(WHERE p.estado='pagado') AS pagados
         FROM pr_prestamos p
         LEFT JOIN pr_productos_prestamo pr ON pr.id=p."productoId"
        WHERE p."empresaId"=$1
        GROUP BY pr.nombre ORDER BY capitalTotal DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'producto', label: 'Producto' },
      { key: 'totalPrestamos', label: 'Total Préstamos' },
      { key: 'capitalTotal', label: 'Capital Total' },
      { key: 'saldoTotal', label: 'Saldo Total' },
      { key: 'moraTotal', label: 'Mora Total' },
      { key: 'alDia', label: 'Al Día' },
      { key: 'morosos', label: 'Morosos' },
      { key: 'vencidos', label: 'Vencidos' },
      { key: 'pagados', label: 'Pagados' },
    ]);
  }

  // 6. Garantías
  async garantias(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT g.tipo, g.descripcion, g."valorTasado", g.estado, g."fechaTasacion",
              p.numero AS prestamo, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor
         FROM pr_garantias g
         JOIN pr_deudores d ON d.id=g."deudorId"
         LEFT JOIN pr_prestamos p ON p.id=g."prestamoId"
        WHERE g."empresaId"=$1 ORDER BY g.tipo, g."valorTasado" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'tipo', label: 'Tipo' },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'valorTasado', label: 'Valor Tasado' },
      { key: 'estado', label: 'Estado' },
      { key: 'fechaTasacion', label: 'Fecha Tasación' },
      { key: 'prestamo', label: 'N° Préstamo' },
      { key: 'deudor', label: 'Deudor' },
    ]);
  }

  // 7. Cobranza (gestiones registradas)
  async gestiones(empresaId: number, params: any) {
    const conds: string[] = [`c."empresaId"=$1`];
    const args: any[] = [empresaId];
    if (params.desde) { args.push(params.desde); conds.push(`c."fechaGestion">=$${args.length}`); }
    if (params.hasta) { args.push(params.hasta); conds.push(`c."fechaGestion"<=$${args.length}`); }
    const rows = await this.ds.query<any[]>(
      `SELECT c."fechaGestion", c."tipoGestion", c.resultado, c.notas,
              c."fechaProximaGestion", p.numero AS prestamo,
              d.nombre||' '||COALESCE(d.apellidos,'') AS deudor, d.telefono
         FROM pr_cobranza c
         JOIN pr_prestamos p ON p.id=c."prestamoId"
         JOIN pr_deudores d ON d.id=p."deudorId"
        WHERE ${conds.join(' AND ')}
        ORDER BY c."fechaGestion" DESC`,
      args,
    );
    return toCsv(rows, [
      { key: 'fechaGestion', label: 'Fecha Gestión' },
      { key: 'tipoGestion', label: 'Tipo' },
      { key: 'resultado', label: 'Resultado' },
      { key: 'prestamo', label: 'N° Préstamo' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'fechaProximaGestion', label: 'Próxima Gestión' },
      { key: 'notas', label: 'Notas' },
    ]);
  }

  // 8. Deudores con saldos
  async deudoresSaldos(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT d.numero, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor, d.cedula,
              d.telefono, d."nivelRiesgo", d."totalPrestado", d."totalPagado",
              d."prestamosActivos", d."diasMoraHistorico"
         FROM pr_deudores d
        WHERE d."empresaId"=$1 AND d.estado='activo' ORDER BY d."totalPrestado" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Deudor' },
      { key: 'deudor', label: 'Nombre' },
      { key: 'cedula', label: 'Cédula' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'nivelRiesgo', label: 'Nivel Riesgo' },
      { key: 'totalPrestado', label: 'Total Prestado' },
      { key: 'totalPagado', label: 'Total Pagado' },
      { key: 'prestamosActivos', label: 'Préstamos Activos' },
      { key: 'diasMoraHistorico', label: 'Días Mora Histórico' },
    ]);
  }

  // 9. Refinanciamientos
  async refinanciamientos(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT r.numero, r."fechaRefinanciamiento", r."montoNuevo", r."plazoNuevo",
              r."tasaNueva", r.motivo, r.observaciones,
              po.numero AS prestamoOriginal, pn.numero AS prestamoNuevo,
              d.nombre||' '||COALESCE(d.apellidos,'') AS deudor
         FROM pr_refinanciamientos r
         JOIN pr_prestamos po ON po.id=r."prestamoOrigenId"
         JOIN pr_prestamos pn ON pn.id=r."prestamoNuevoId"
         JOIN pr_deudores d ON d.id=po."deudorId"
        WHERE r."empresaId"=$1 ORDER BY r."fechaRefinanciamiento" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Ref.' },
      { key: 'fechaRefinanciamiento', label: 'Fecha' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'prestamoOriginal', label: 'Préstamo Original' },
      { key: 'prestamoNuevo', label: 'Préstamo Nuevo' },
      { key: 'montoNuevo', label: 'Monto Nuevo' },
      { key: 'plazoNuevo', label: 'Plazo Nuevo (meses)' },
      { key: 'tasaNueva', label: 'Tasa Nueva %' },
      { key: 'motivo', label: 'Motivo' },
    ]);
  }

  // 10. Índices financieros (resumen)
  async indicesFinancieros(empresaId: number) {
    const [kpis] = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER(WHERE estado NOT IN ('cancelado','refinanciado')) AS totalActivos,
         COUNT(*) FILTER(WHERE estado='al_dia') AS alDia,
         COUNT(*) FILTER(WHERE estado='moroso') AS morosos,
         COUNT(*) FILTER(WHERE estado='vencido') AS vencidos,
         COUNT(*) FILTER(WHERE estado='pagado') AS pagados,
         COALESCE(SUM("montoPrincipal") FILTER(WHERE estado NOT IN ('cancelado','refinanciado','pagado')),0) AS carteraActiva,
         COALESCE(SUM("saldoCapital") FILTER(WHERE estado NOT IN ('cancelado','refinanciado')),0) AS saldoCapitalTotal,
         COALESCE(SUM("saldoMora") FILTER(WHERE estado NOT IN ('cancelado','refinanciado')),0) AS moraTotal,
         COALESCE(SUM("totalPagado"),0) AS recaudadoTotal
       FROM pr_prestamos WHERE "empresaId"=$1`,
      [empresaId],
    );
    const indiceMorosidad = kpis.saldoCapitalTotal > 0
      ? ((kpis.moraTotal / kpis.saldoCapitalTotal) * 100).toFixed(2) : '0.00';
    const rows = [{ ...kpis, indiceMorosidad: `${indiceMorosidad}%` }];
    return toCsv(rows, [
      { key: 'totalActivos', label: 'Préstamos Activos' },
      { key: 'alDia', label: 'Al Día' },
      { key: 'morosos', label: 'Morosos' },
      { key: 'vencidos', label: 'Vencidos' },
      { key: 'pagados', label: 'Pagados' },
      { key: 'carteraActiva', label: 'Cartera Activa (RD$)' },
      { key: 'saldoCapitalTotal', label: 'Saldo Capital Total (RD$)' },
      { key: 'moraTotal', label: 'Mora Total (RD$)' },
      { key: 'recaudadoTotal', label: 'Recaudado Total (RD$)' },
      { key: 'indiceMorosidad', label: 'Índice de Morosidad' },
    ]);
  }

  // 11. Cuotas vencidas (pendientes de pago pasada la fecha)
  async cuotasVencidas(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT c."numeroCuota", c."fechaVencimiento",
              GREATEST(0,c.capital-c."capitalPagado") AS capitalPend,
              GREATEST(0,c.interes-c."interesPagado") AS interesPend,
              COALESCE(c."moraGenerada",0) AS mora,
              CURRENT_DATE-c."fechaVencimiento" AS diasVencida,
              p.numero AS prestamo, d.nombre||' '||COALESCE(d.apellidos,'') AS deudor, d.telefono
         FROM pr_cuotas c
         JOIN pr_prestamos p ON p.id=c."prestamoId"
         JOIN pr_deudores d ON d.id=p."deudorId"
        WHERE c."empresaId"=$1 AND c.estado IN ('vencida','parcial')
          AND c."fechaVencimiento" < CURRENT_DATE
        ORDER BY c."fechaVencimiento"`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'prestamo', label: 'N° Préstamo' },
      { key: 'deudor', label: 'Deudor' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'numeroCuota', label: 'N° Cuota' },
      { key: 'fechaVencimiento', label: 'Fecha Vencimiento' },
      { key: 'diasVencida', label: 'Días Vencida' },
      { key: 'capitalPend', label: 'Capital Pendiente' },
      { key: 'interesPend', label: 'Interés Pendiente' },
      { key: 'mora', label: 'Mora' },
    ]);
  }

  // 12. Historial completo de un deudor
  async estadoCuentaDeudor(empresaId: number, deudorId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT p.numero AS prestamo, p.estado AS estadoPrestamo,
              p."montoPrincipal", p."saldoCapital", p."saldoMora",
              p."fechaDesembolso", p."fechaVencimiento",
              pg.numero AS pago, pg.fecha AS fechaPago, pg."montoPagado",
              pg."aplicadoCapital", pg."aplicadoInteres", pg."aplicadoMora"
         FROM pr_prestamos p
         LEFT JOIN pr_pagos pg ON pg."prestamoId"=p.id
        WHERE p."empresaId"=$1 AND p."deudorId"=$2
        ORDER BY p.id, pg.fecha`,
      [empresaId, deudorId],
    );
    return toCsv(rows, [
      { key: 'prestamo', label: 'N° Préstamo' },
      { key: 'estadoPrestamo', label: 'Estado' },
      { key: 'montoPrincipal', label: 'Capital' },
      { key: 'saldoCapital', label: 'Saldo Capital' },
      { key: 'saldoMora', label: 'Saldo Mora' },
      { key: 'fechaDesembolso', label: 'Desembolso' },
      { key: 'fechaVencimiento', label: 'Vencimiento' },
      { key: 'pago', label: 'N° Pago' },
      { key: 'fechaPago', label: 'Fecha Pago' },
      { key: 'montoPagado', label: 'Monto Pagado' },
      { key: 'aplicadoCapital', label: 'Capital Aplicado' },
      { key: 'aplicadoInteres', label: 'Interés Aplicado' },
      { key: 'aplicadoMora', label: 'Mora Aplicada' },
    ]);
  }
}
