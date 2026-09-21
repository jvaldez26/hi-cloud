import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarReportePDF } from '../common/pdf/tabular-pdf.helper';
import type { TabularReportData } from '../common/pdf/tabular-pdf.helper';
import { fechaHoraRD } from '../common/utils/fecha-local.util';
import { EstadoResultadosDetalladoService, FiltrosEstadoResultadosDetallado, EstadoResultadosDetallado } from './estado-resultados-detallado.service';
import { aplanarEstadoResultados, EstadoResultadosPeriodo } from './estado-resultados-bloques.util';

const FMT = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(n ?? 0);

const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Estado de Resultados detallado (2026-09-21) — exportación respetando los
 * filtros activos (rango, ocultar en cero). Las tres salidas parten SIEMPRE
 * del mismo EstadoResultadosDetallado (nunca recalculan nada) aplanado con
 * aplanarEstadoResultados(), que conserva el orden de bloques y marca
 * totales/líneas calculadas.
 *
 * Excel/CSV: soportan las 4 vistas de comparación completas (incluida
 * "Por mes", con sus 12 columnas + Total). PDF: una sola tabla de columnas
 * fijas (motivo de tabular-pdf.helper.ts) — se exporta el período principal,
 * con Comparado/Diferencia cuando compara contra año anterior; "Por mes" no
 * tiene una representación tabular fija razonable en PDF y se omite (Excel/
 * CSV son las salidas indicadas para esa vista).
 */
@Injectable()
export class EstadoResultadosExportService {
  private readonly logger = new Logger(EstadoResultadosExportService.name);

  constructor(
    private readonly detalladoSvc: EstadoResultadosDetalladoService,
    private readonly tenantSvc: TenantService,
    @InjectRepository(Empresa) private readonly empresaRepo: Repository<Empresa>,
  ) {}

  private async getEmpresa(): Promise<Empresa | null> {
    try {
      const id = this.tenantSvc.getEmpresaId();
      return await this.empresaRepo.findOne({ where: { id, isActive: true } });
    } catch { return null; }
  }

  private nombreArchivo(er: EstadoResultadosDetallado, ext: string): string {
    return `Estado-Resultados-${er.desde}_${er.hasta}.${ext}`;
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  async generarExcel(filtros: FiltrosEstadoResultadosDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const [er, empresa] = await Promise.all([this.detalladoSvc.generar(filtros), this.getEmpresa()]);
    const wb = XLSX.utils.book_new();
    const encabezadoEmpresa = [
      [empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa'],
      [`Estado de Resultados — Del ${fmtFecha(er.desde)} al ${fmtFecha(er.hasta)}`],
      [`Generado: ${fechaHoraRD()}`],
      [],
    ];

    if (er.porMes) {
      const meses = er.porMes.meses;
      const encabezado = ['Bloque / Línea', ...meses.map(m => fmtFecha(m.desde).split(' ')[2] ?? m.mes), 'Total'];
      const filasBase = aplanarEstadoResultados(er.porMes.total);
      const filasMeses = meses.map(m => aplanarEstadoResultados(m.periodo));
      const filas = filasBase.map((f, i) => [
        f.nombre,
        ...filasMeses.map(fm => fm[i]?.monto ?? 0),
        f.monto,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...encabezadoEmpresa, encabezado, ...filas]);
      ws['!cols'] = encabezado.map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Por mes');
    } else {
      const conAnterior = !!er.anioAnterior;
      const conAcumulado = !!er.acumulado;
      const encabezado = [
        'Bloque', 'Cuenta', 'Monto', '% Ingresos', '% Margen',
        ...(conAcumulado ? ['Acumulado'] : []),
        ...(conAnterior ? ['Año anterior', 'Diferencia', '% Diferencia'] : []),
      ];
      const filasAnterior = er.anioAnterior ? aplanarEstadoResultados(er.anioAnterior.periodo) : null;
      const filasAcumulado = er.acumulado ? aplanarEstadoResultados(er.acumulado.periodo) : null;
      const filas = aplanarEstadoResultados(er.periodo).map((f, i) => [
        f.bloque, f.nombre, f.monto, f.porcentajeIngresos, f.porcentajeMargen ?? '',
        ...(conAcumulado ? [filasAcumulado![i]?.monto ?? 0] : []),
        ...(conAnterior ? [
          filasAnterior![i]?.monto ?? 0,
          +(f.monto - (filasAnterior![i]?.monto ?? 0)).toFixed(2),
          '',
        ] : []),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...encabezadoEmpresa, encabezado, ...filas]);
      ws['!cols'] = encabezado.map(() => ({ wch: 20 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Estado de Resultados');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    this.logger.log(`Excel Estado de Resultados generado para empresa #${empresa?.id}`);
    return { buffer, filename: this.nombreArchivo(er, 'xlsx') };
  }

  // ── CSV ──────────────────────────────────────────────────────────────────

  private csvEscape(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async generarCsv(filtros: FiltrosEstadoResultadosDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const er = await this.detalladoSvc.generar(filtros);

    let encabezado: string[];
    let filas: unknown[][];

    if (er.porMes) {
      const meses = er.porMes.meses;
      encabezado = ['Bloque / Línea', ...meses.map(m => String(m.mes)), 'Total'];
      const filasBase = aplanarEstadoResultados(er.porMes.total);
      const filasMeses = meses.map(m => aplanarEstadoResultados(m.periodo));
      filas = filasBase.map((f, i) => [f.nombre, ...filasMeses.map(fm => fm[i]?.monto ?? 0), f.monto]);
    } else {
      const conAnterior = !!er.anioAnterior;
      const conAcumulado = !!er.acumulado;
      encabezado = [
        'Bloque', 'Cuenta', 'Monto', '% Ingresos', '% Margen',
        ...(conAcumulado ? ['Acumulado'] : []),
        ...(conAnterior ? ['Año anterior', 'Diferencia'] : []),
      ];
      const filasAnterior = er.anioAnterior ? aplanarEstadoResultados(er.anioAnterior.periodo) : null;
      const filasAcumulado = er.acumulado ? aplanarEstadoResultados(er.acumulado.periodo) : null;
      filas = aplanarEstadoResultados(er.periodo).map((f, i) => [
        f.bloque, f.nombre, f.monto, f.porcentajeIngresos, f.porcentajeMargen ?? '',
        ...(conAcumulado ? [filasAcumulado![i]?.monto ?? 0] : []),
        ...(conAnterior ? [filasAnterior![i]?.monto ?? 0, +(f.monto - (filasAnterior![i]?.monto ?? 0)).toFixed(2)] : []),
      ]);
    }

    const lineas = [
      encabezado.map(h => this.csvEscape(h)).join(','),
      ...filas.map(f => f.map(v => this.csvEscape(v)).join(',')),
    ];

    // BOM UTF-8 — sin esto Excel abre acentos/ñ como caracteres corruptos.
    const buffer = Buffer.from('﻿' + lineas.join('\r\n'), 'utf8');
    return { buffer, filename: this.nombreArchivo(er, 'csv') };
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  async generarPdf(filtros: FiltrosEstadoResultadosDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const [er, empresa] = await Promise.all([this.detalladoSvc.generar(filtros), this.getEmpresa()]);
    const conAnterior = !!er.anioAnterior;

    const filasAnterior = er.anioAnterior ? aplanarEstadoResultados(er.anioAnterior.periodo) : null;
    const rows: Record<string, any>[] = aplanarEstadoResultados(er.periodo).map((f, i) => ({
      bloque: f.nombre,
      monto: f.monto,
      comparado: filasAnterior ? filasAnterior[i]?.monto ?? 0 : undefined,
      diferencia: filasAnterior ? +(f.monto - (filasAnterior[i]?.monto ?? 0)).toFixed(2) : undefined,
    }));

    const periodo: EstadoResultadosPeriodo = er.periodo;
    const report: TabularReportData = {
      titulo:    'Estado de Resultados',
      subtitulo: `Del ${fmtFecha(er.desde)} al ${fmtFecha(er.hasta)}` + (conAnterior && er.anioAnterior
        ? ` — Comparado con ${fmtFecha(er.anioAnterior.desde)} al ${fmtFecha(er.anioAnterior.hasta)}` : ''),
      empresa:   empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
      rnc:       empresa?.rnc,
      columns: [
        { header: 'Bloque / Línea', key: 'bloque', width: conAnterior ? 45 : 65 },
        { header: 'Monto',   key: 'monto',   width: conAnterior ? 18 : 35, money: true, align: 'right' },
        ...(conAnterior ? [
          { header: 'Año anterior', key: 'comparado',  width: 18.5, money: true as const, align: 'right' as const },
          { header: 'Diferencia',   key: 'diferencia', width: 18.5, money: true as const, align: 'right' as const },
        ] : []),
      ],
      rows,
      summaryCards: [
        { label: 'Total Ingresos', value: FMT(periodo.ingresos.total) },
        { label: 'Utilidad Bruta', value: FMT(periodo.utilidadBruta.monto), red: periodo.utilidadBruta.monto < 0 },
        {
          label: 'Ganancia (Pérdida) del Período',
          value: FMT(periodo.gananciaPerdidaDelPeriodo.monto),
          red: periodo.gananciaPerdidaDelPeriodo.monto < 0,
        },
      ],
      totalRow: { bloque: 'GANANCIA (PÉRDIDA) DEL PERÍODO', monto: periodo.gananciaPerdidaDelPeriodo.monto },
    };

    const buffer = await generarReportePDF(report);
    this.logger.log(`PDF Estado de Resultados generado para empresa #${empresa?.id}`);
    return { buffer, filename: this.nombreArchivo(er, 'pdf') };
  }
}
