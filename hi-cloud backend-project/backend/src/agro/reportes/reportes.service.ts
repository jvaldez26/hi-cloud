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
export class AgroReportesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async rentabilidadCiclos(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT c.numero, cu.nombre AS cultivo, cu.variedad, p.nombre AS parcela,
              c."fechaSiembra", c."fechaCosechaReal", c.estado,
              c."costoSemilla", c."costoInsumos", c."costoManoObra", c."costoMaquinaria",
              c."costoOtros", c."costoTotal", c."ingresoVentas",
              c."ingresoVentas"-c."costoTotal" AS rentabilidad,
              CASE WHEN c."ingresoVentas">0 THEN ROUND((c."ingresoVentas"-c."costoTotal")/c."ingresoVentas"*100,2) ELSE 0 END AS "margenPct",
              c."cantidadCosechada", c."unidadCosecha",
              CASE WHEN c."cantidadCosechada">0 THEN ROUND(c."costoTotal"/c."cantidadCosechada",2) ELSE 0 END AS "costoPorUnidad"
         FROM ag_ciclos c
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
        WHERE c."empresaId"=$1 ORDER BY c."createdAt" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Ciclo' }, { key: 'cultivo', label: 'Cultivo' },
      { key: 'variedad', label: 'Variedad' }, { key: 'parcela', label: 'Parcela' },
      { key: 'fechaSiembra', label: 'Siembra' }, { key: 'fechaCosechaReal', label: 'Cosecha' },
      { key: 'estado', label: 'Estado' }, { key: 'costoSemilla', label: 'Costo Semilla' },
      { key: 'costoInsumos', label: 'Costo Insumos' }, { key: 'costoManoObra', label: 'Mano de Obra' },
      { key: 'costoMaquinaria', label: 'Maquinaria' }, { key: 'costoTotal', label: 'Costo Total' },
      { key: 'ingresoVentas', label: 'Ingresos' }, { key: 'rentabilidad', label: 'Rentabilidad' },
      { key: 'margenPct', label: 'Margen %' }, { key: 'cantidadCosechada', label: 'Cantidad Cosechada' },
      { key: 'unidadCosecha', label: 'Unidad' }, { key: 'costoPorUnidad', label: 'Costo/Unidad' },
    ]);
  }

  async rendimientoCultivos(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT cu.nombre AS cultivo, cu.variedad, p.nombre AS parcela,
              c.numero AS ciclo, c."areaSembrada", c."unidadCosecha",
              c."rendimientoEstimado", c."cantidadCosechada",
              CASE WHEN c."rendimientoEstimado">0
                   THEN ROUND(c."cantidadCosechada"/c."rendimientoEstimado"*100,1) ELSE NULL END AS "pctRendimiento",
              c."mermaPerdida"
         FROM ag_ciclos c
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
        WHERE c."empresaId"=$1 AND c."cantidadCosechada" IS NOT NULL
        ORDER BY cu.nombre, c."fechaSiembra" DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'cultivo', label: 'Cultivo' }, { key: 'variedad', label: 'Variedad' },
      { key: 'ciclo', label: 'N° Ciclo' }, { key: 'parcela', label: 'Parcela' },
      { key: 'areaSembrada', label: 'Área Sembrada' }, { key: 'rendimientoEstimado', label: 'Rendimiento Est.' },
      { key: 'cantidadCosechada', label: 'Cosechado Real' }, { key: 'pctRendimiento', label: '% Rendimiento' },
      { key: 'unidadCosecha', label: 'Unidad' }, { key: 'mermaPerdida', label: 'Merma/Pérdida' },
    ]);
  }

  async costosPorCategoria(empresaId: number, params: any) {
    const conds: string[] = [`c."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.desde) { conds.push(`c."fechaSiembra">=$${idx++}`); args.push(params.desde); }
    if (params.hasta) { conds.push(`c."fechaSiembra"<=$${idx++}`); args.push(params.hasta); }
    const rows = await this.ds.query<any[]>(
      `SELECT cu.nombre AS cultivo, c.numero,
              c."costoSemilla", c."costoInsumos", c."costoManoObra",
              c."costoMaquinaria", c."costoOtros", c."costoTotal"
         FROM ag_ciclos c LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
        WHERE ${conds.join(' AND ')} ORDER BY c."fechaSiembra" DESC`,
      args,
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Ciclo' }, { key: 'cultivo', label: 'Cultivo' },
      { key: 'costoSemilla', label: 'Semilla' }, { key: 'costoInsumos', label: 'Insumos' },
      { key: 'costoManoObra', label: 'Mano de Obra' }, { key: 'costoMaquinaria', label: 'Maquinaria' },
      { key: 'costoOtros', label: 'Otros' }, { key: 'costoTotal', label: 'Total' },
    ]);
  }

  async produccionLeche(empresaId: number, params: any) {
    const conds: string[] = [`e."empresaId"=$1 AND e.tipo='produccion_leche'`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.desde) { conds.push(`e.fecha>=$${idx++}`); args.push(params.desde); }
    if (params.hasta) { conds.push(`e.fecha<=$${idx++}`); args.push(params.hasta); }
    const rows = await this.ds.query<any[]>(
      `SELECT e.fecha, a.numero AS arete, a.nombre, a.raza,
              e."cantidadProduccion", e."unidadProduccion", e.responsable
         FROM ag_eventos_animal e JOIN ag_animales a ON a.id=e."animalId"
        WHERE ${conds.join(' AND ')} ORDER BY e.fecha DESC, a.numero`,
      args,
    );
    return toCsv(rows, [
      { key: 'fecha', label: 'Fecha' }, { key: 'arete', label: 'Arete' },
      { key: 'nombre', label: 'Nombre' }, { key: 'raza', label: 'Raza' },
      { key: 'cantidadProduccion', label: 'Producción' }, { key: 'unidadProduccion', label: 'Unidad' },
    ]);
  }

  async inventarioAnimales(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT a.numero AS arete, a.nombre, a.tipo, a.raza, a.sexo, a.estado, a.proposito,
              a."fechaNacimiento", a."pesoActual", a."costoAdquisicion",
              f.nombre AS finca
         FROM ag_animales a LEFT JOIN ag_fincas f ON f.id=a."fincaId"
        WHERE a."empresaId"=$1 AND a."isActive"=true ORDER BY a.tipo, a.numero`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'arete', label: 'Arete' }, { key: 'nombre', label: 'Nombre' },
      { key: 'tipo', label: 'Tipo' }, { key: 'raza', label: 'Raza' },
      { key: 'sexo', label: 'Sexo' }, { key: 'estado', label: 'Estado' },
      { key: 'proposito', label: 'Propósito' }, { key: 'fechaNacimiento', label: 'Nacimiento' },
      { key: 'pesoActual', label: 'Peso (kg)' }, { key: 'costoAdquisicion', label: 'Costo Adq.' },
      { key: 'finca', label: 'Finca' },
    ]);
  }

  async trazabilidadInsumos(empresaId: number, params: any) {
    const conds: string[] = [`a."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.desde) { conds.push(`a.fecha>=$${idx++}`); args.push(params.desde); }
    if (params.hasta) { conds.push(`a.fecha<=$${idx++}`); args.push(params.hasta); }
    const rows = await this.ds.query<any[]>(
      `SELECT a.fecha, a."insumoNombre", a.tipo, a.cantidad, a.unidad,
              a."dosisPorArea", a."periodoCarencia", a."loteInsumo",
              c.numero AS ciclo, cu.nombre AS cultivo, p.nombre AS parcela
         FROM ag_aplicaciones_insumo a
         JOIN ag_ciclos c ON c.id=a."cicloId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
        WHERE ${conds.join(' AND ')} ORDER BY a.fecha DESC`,
      args,
    );
    return toCsv(rows, [
      { key: 'fecha', label: 'Fecha' }, { key: 'insumoNombre', label: 'Insumo' },
      { key: 'tipo', label: 'Tipo' }, { key: 'ciclo', label: 'N° Ciclo' },
      { key: 'cultivo', label: 'Cultivo' }, { key: 'parcela', label: 'Parcela' },
      { key: 'cantidad', label: 'Cantidad' }, { key: 'unidad', label: 'Unidad' },
      { key: 'dosisPorArea', label: 'Dosis/Área' }, { key: 'periodoCarencia', label: 'Carencia (días)' },
      { key: 'loteInsumo', label: 'Lote Insumo' },
    ]);
  }

  async consumoInsumosPorCiclo(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT c.numero AS ciclo, cu.nombre AS cultivo, a."insumoNombre",
              a.tipo, SUM(a.cantidad) AS totalCantidad, a.unidad,
              SUM(a."costoTotal") AS costoTotal
         FROM ag_aplicaciones_insumo a
         JOIN ag_ciclos c ON c.id=a."cicloId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
        WHERE a."empresaId"=$1
        GROUP BY c.numero, cu.nombre, a."insumoNombre", a.tipo, a.unidad
        ORDER BY c.numero, costoTotal DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'ciclo', label: 'N° Ciclo' }, { key: 'cultivo', label: 'Cultivo' },
      { key: 'insumoNombre', label: 'Insumo' }, { key: 'tipo', label: 'Tipo' },
      { key: 'totalCantidad', label: 'Cantidad Total' }, { key: 'unidad', label: 'Unidad' },
      { key: 'costoTotal', label: 'Costo Total' },
    ]);
  }

  async calendarioSanitario(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT e."proximaFecha", e.tipo, e.producto, e.dosis,
              a.numero AS arete, a.nombre, a.tipo AS tipoAnimal, a.raza,
              CASE WHEN e."proximaFecha" < CURRENT_DATE THEN 'VENCIDO'
                   WHEN e."proximaFecha" = CURRENT_DATE THEN 'HOY'
                   ELSE 'PENDIENTE' END AS estatus,
              e."proximaFecha"::date - CURRENT_DATE AS diasRestantes
         FROM ag_eventos_animal e JOIN ag_animales a ON a.id=e."animalId"
        WHERE e."empresaId"=$1 AND e."proximaFecha" IS NOT NULL AND a.estado='activo'
        ORDER BY e."proximaFecha"`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'proximaFecha', label: 'Fecha Programada' }, { key: 'estatus', label: 'Estatus' },
      { key: 'diasRestantes', label: 'Días Restantes' }, { key: 'tipo', label: 'Tipo Evento' },
      { key: 'producto', label: 'Producto/Vacuna' }, { key: 'arete', label: 'Arete' },
      { key: 'nombre', label: 'Nombre Animal' }, { key: 'tipoAnimal', label: 'Tipo' },
    ]);
  }

  async usoCostoMaquinaria(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT l."usoMaquinaria", COUNT(*) AS usos,
              SUM(l."costoMaquinaria") AS costoTotal, SUM(l."horasTrabajadas") AS horasTotal,
              AVG(l."costoMaquinaria") AS costoPromedio
         FROM ag_labores l WHERE l."empresaId"=$1 AND l."usoMaquinaria" IS NOT NULL
        GROUP BY l."usoMaquinaria" ORDER BY costoTotal DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'usoMaquinaria', label: 'Maquinaria' }, { key: 'usos', label: 'Usos' },
      { key: 'horasTotal', label: 'Horas Total' }, { key: 'costoTotal', label: 'Costo Total' },
      { key: 'costoPromedio', label: 'Costo Promedio' },
    ]);
  }

  async proyeccionCosechas(empresaId: number, params: any) {
    const dias = Number(params.dias ?? 60);
    const rows = await this.ds.query<any[]>(
      `SELECT c.numero, cu.nombre AS cultivo, p.nombre AS parcela,
              c."fechaEstimadaCosecha", c."rendimientoEstimado", c."unidadCosecha",
              c."areaSembrada", c."costoTotal",
              c."fechaEstimadaCosecha"::date - CURRENT_DATE AS diasParaCosecha
         FROM ag_ciclos c
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
        WHERE c."empresaId"=$1 AND c.estado NOT IN ('cerrado','cancelado')
          AND c."fechaEstimadaCosecha" IS NOT NULL
          AND c."fechaEstimadaCosecha"::date BETWEEN CURRENT_DATE AND CURRENT_DATE+$2
        ORDER BY c."fechaEstimadaCosecha"`,
      [empresaId, dias],
    );
    return toCsv(rows, [
      { key: 'numero', label: 'N° Ciclo' }, { key: 'cultivo', label: 'Cultivo' },
      { key: 'parcela', label: 'Parcela' }, { key: 'fechaEstimadaCosecha', label: 'Fecha Est. Cosecha' },
      { key: 'diasParaCosecha', label: 'Días para Cosechar' }, { key: 'rendimientoEstimado', label: 'Rendimiento Est.' },
      { key: 'unidadCosecha', label: 'Unidad' }, { key: 'areaSembrada', label: 'Área (tareas)' },
      { key: 'costoTotal', label: 'Costo Acumulado' },
    ]);
  }

  async comparativoParcelas(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT p.nombre AS parcela, p.area, p."unidadArea",
              COUNT(c.id) AS totalCiclos,
              COALESCE(SUM(c."cantidadCosechada"),0) AS totalCosechado,
              COALESCE(SUM(c."costoTotal"),0) AS costoTotalHistorico,
              COALESCE(SUM(c."ingresoVentas"),0) AS ingresosHistorico,
              COALESCE(AVG(c."ingresoVentas"-c."costoTotal"),0) AS rentabPromedio
         FROM ag_parcelas p
         LEFT JOIN ag_ciclos c ON c."parcelaId"=p.id
        WHERE p."empresaId"=$1 AND p."isActive"=true
        GROUP BY p.id, p.nombre, p.area, p."unidadArea"
        ORDER BY rentabPromedio DESC`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'parcela', label: 'Parcela' }, { key: 'area', label: 'Área' },
      { key: 'unidadArea', label: 'Unidad' }, { key: 'totalCiclos', label: 'Total Ciclos' },
      { key: 'totalCosechado', label: 'Total Cosechado' },
      { key: 'costoTotalHistorico', label: 'Costo Histórico' },
      { key: 'ingresosHistorico', label: 'Ingresos Histórico' },
      { key: 'rentabPromedio', label: 'Rentab. Promedio' },
    ]);
  }

  async stockInsumos(empresaId: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT nombre, tipo, marca, presentacion, unidad,
              "stockActual", "stockMinimo",
              CASE WHEN "stockActual"<="stockMinimo" THEN 'STOCK BAJO' ELSE 'OK' END AS alerta,
              "costoUnitario",
              "stockActual"*"costoUnitario" AS valorInventario
         FROM ag_insumos WHERE "empresaId"=$1 AND "isActive"=true ORDER BY tipo, nombre`,
      [empresaId],
    );
    return toCsv(rows, [
      { key: 'nombre', label: 'Insumo' }, { key: 'tipo', label: 'Tipo' },
      { key: 'marca', label: 'Marca' }, { key: 'presentacion', label: 'Presentación' },
      { key: 'unidad', label: 'Unidad' }, { key: 'stockActual', label: 'Stock Actual' },
      { key: 'stockMinimo', label: 'Stock Mínimo' }, { key: 'alerta', label: 'Alerta' },
      { key: 'costoUnitario', label: 'Costo Unit.' }, { key: 'valorInventario', label: 'Valor Inventario' },
    ]);
  }
}
