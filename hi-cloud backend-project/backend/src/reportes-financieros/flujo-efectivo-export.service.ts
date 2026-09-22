import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarReportePDF } from '../common/pdf/tabular-pdf.helper';
import type { TabularReportData } from '../common/pdf/tabular-pdf.helper';
import { fechaHoraRD } from '../common/utils/fecha-local.util';
import { FlujoEfectivoDetalladoService, FiltrosFlujoEfectivoDetallado, FlujoEfectivoDetallado } from './flujo-efectivo-detallado.service';
import { aplanarFlujoEfectivo, FlujoEfectivoPeriodo } from './flujo-efectivo-bloques.util';

const FMT = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(n ?? 0);

const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Estado de Flujo de Efectivo detallado (2026-09-22) — exportación
 * respetando los filtros activos, mismo patrón que
 * EstadoResultadosExportService: las tres salidas parten SIEMPRE del mismo
 * FlujoEfectivoDetallado (nunca recalculan nada) aplanado con
 * aplanarFlujoEfectivo(), que conserva el orden de bloques.
 */
@Injectable()
export class FlujoEfectivoExportService {
  private readonly logger = new Logger(FlujoEfectivoExportService.name);

  constructor(
    private readonly detalladoSvc: FlujoEfectivoDetalladoService,
    private readonly tenantSvc: TenantService,
    @InjectRepository(Empresa) private readonly empresaRepo: Repository<Empresa>,
  ) {}

  private async getEmpresa(): Promise<Empresa | null> {
    try {
      const id = this.tenantSvc.getEmpresaId();
      return await this.empresaRepo.findOne({ where: { id, isActive: true } });
    } catch { return null; }
  }

  private nombreArchivo(fe: FlujoEfectivoDetallado, ext: string): string {
    return `Flujo-Efectivo-${fe.desde}_${fe.hasta}.${ext}`;
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  async generarExcel(filtros: FiltrosFlujoEfectivoDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const [fe, empresa] = await Promise.all([this.detalladoSvc.generar(filtros), this.getEmpresa()]);
    const wb = XLSX.utils.book_new();
    const encabezadoEmpresa = [
      [empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa'],
      [`Estado de Flujo de Efectivo — Del ${fmtFecha(fe.desde)} al ${fmtFecha(fe.hasta)}`],
      [`Generado: ${fechaHoraRD()}`],
      [],
    ];

    if (fe.porMes) {
      const meses = fe.porMes.meses;
      const encabezado = ['Bloque / Línea', ...meses.map(m => fmtFecha(m.desde).split(' ')[2] ?? m.mes), 'Total'];
      const filasBase = aplanarFlujoEfectivo(fe.porMes.total);
      const filasMeses = meses.map(m => aplanarFlujoEfectivo(m.periodo));
      const filas = filasBase.map((f, i) => [f.nombre, ...filasMeses.map(fm => fm[i]?.monto ?? 0), f.monto]);
      const ws = XLSX.utils.aoa_to_sheet([...encabezadoEmpresa, encabezado, ...filas]);
      ws['!cols'] = encabezado.map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Por mes');
    } else {
      const conAnterior = !!fe.anioAnterior;
      const conAcumulado = !!fe.acumulado;
      const encabezado = [
        'Bloque', 'Línea', 'Monto',
        ...(conAcumulado ? ['Acumulado'] : []),
        ...(conAnterior ? ['Año anterior', 'Diferencia'] : []),
      ];
      const filasAnterior = fe.anioAnterior ? aplanarFlujoEfectivo(fe.anioAnterior.periodo) : null;
      const filasAcumulado = fe.acumulado ? aplanarFlujoEfectivo(fe.acumulado.periodo) : null;
      const filas = aplanarFlujoEfectivo(fe.periodo).map((f, i) => [
        f.bloque, f.nombre, f.monto,
        ...(conAcumulado ? [filasAcumulado![i]?.monto ?? 0] : []),
        ...(conAnterior ? [filasAnterior![i]?.monto ?? 0, +(f.monto - (filasAnterior![i]?.monto ?? 0)).toFixed(2)] : []),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...encabezadoEmpresa, encabezado, ...filas]);
      ws['!cols'] = encabezado.map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Flujo de Efectivo');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    this.logger.log(`Excel Flujo de Efectivo generado para empresa #${empresa?.id}`);
    return { buffer, filename: this.nombreArchivo(fe, 'xlsx') };
  }

  // ── CSV ──────────────────────────────────────────────────────────────────

  private csvEscape(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async generarCsv(filtros: FiltrosFlujoEfectivoDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const fe = await this.detalladoSvc.generar(filtros);

    let encabezado: string[];
    let filas: unknown[][];

    if (fe.porMes) {
      const meses = fe.porMes.meses;
      encabezado = ['Bloque / Línea', ...meses.map(m => String(m.mes)), 'Total'];
      const filasBase = aplanarFlujoEfectivo(fe.porMes.total);
      const filasMeses = meses.map(m => aplanarFlujoEfectivo(m.periodo));
      filas = filasBase.map((f, i) => [f.nombre, ...filasMeses.map(fm => fm[i]?.monto ?? 0), f.monto]);
    } else {
      const conAnterior = !!fe.anioAnterior;
      const conAcumulado = !!fe.acumulado;
      encabezado = [
        'Bloque', 'Línea', 'Monto',
        ...(conAcumulado ? ['Acumulado'] : []),
        ...(conAnterior ? ['Año anterior', 'Diferencia'] : []),
      ];
      const filasAnterior = fe.anioAnterior ? aplanarFlujoEfectivo(fe.anioAnterior.periodo) : null;
      const filasAcumulado = fe.acumulado ? aplanarFlujoEfectivo(fe.acumulado.periodo) : null;
      filas = aplanarFlujoEfectivo(fe.periodo).map((f, i) => [
        f.bloque, f.nombre, f.monto,
        ...(conAcumulado ? [filasAcumulado![i]?.monto ?? 0] : []),
        ...(conAnterior ? [filasAnterior![i]?.monto ?? 0, +(f.monto - (filasAnterior![i]?.monto ?? 0)).toFixed(2)] : []),
      ]);
    }

    const lineas = [
      encabezado.map(h => this.csvEscape(h)).join(','),
      ...filas.map(f => f.map(v => this.csvEscape(v)).join(',')),
    ];

    const buffer = Buffer.from('﻿' + lineas.join('\r\n'), 'utf8'); // BOM UTF-8
    return { buffer, filename: this.nombreArchivo(fe, 'csv') };
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  async generarPdf(filtros: FiltrosFlujoEfectivoDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const [fe, empresa] = await Promise.all([this.detalladoSvc.generar(filtros), this.getEmpresa()]);
    const conAnterior = !!fe.anioAnterior;

    const filasAnterior = fe.anioAnterior ? aplanarFlujoEfectivo(fe.anioAnterior.periodo) : null;
    const rows: Record<string, any>[] = aplanarFlujoEfectivo(fe.periodo).map((f, i) => ({
      bloque: f.nombre,
      monto: f.monto,
      comparado: filasAnterior ? filasAnterior[i]?.monto ?? 0 : undefined,
      diferencia: filasAnterior ? +(f.monto - (filasAnterior[i]?.monto ?? 0)).toFixed(2) : undefined,
    }));

    const periodo: FlujoEfectivoPeriodo = fe.periodo;
    const report: TabularReportData = {
      titulo:    'Estado de Flujo de Efectivo',
      subtitulo: `Del ${fmtFecha(fe.desde)} al ${fmtFecha(fe.hasta)}` + (conAnterior && fe.anioAnterior
        ? ` — Comparado con ${fmtFecha(fe.anioAnterior.desde)} al ${fmtFecha(fe.anioAnterior.hasta)}` : ''),
      empresa:   empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
      rnc:       empresa?.rnc,
      columns: [
        { header: 'Bloque / Línea', key: 'bloque', width: conAnterior ? 45 : 65 },
        { header: 'Monto', key: 'monto', width: conAnterior ? 18 : 35, money: true, align: 'right' },
        ...(conAnterior ? [
          { header: 'Año anterior', key: 'comparado',  width: 18.5, money: true as const, align: 'right' as const },
          { header: 'Diferencia',   key: 'diferencia', width: 18.5, money: true as const, align: 'right' as const },
        ] : []),
      ],
      rows,
      summaryCards: [
        { label: 'Efectivo Neto de Operaciones', value: FMT(periodo.operaciones.total), red: periodo.operaciones.total < 0 },
        { label: 'Cambio Neto en el Efectivo',   value: FMT(periodo.cambioNetoEfectivo), red: periodo.cambioNetoEfectivo < 0 },
        { label: 'Efectivo al Final del Período', value: FMT(periodo.efectivoFin) },
      ],
      totalRow: { bloque: 'EFECTIVO AL FINAL DEL PERÍODO', monto: periodo.efectivoFin },
    };

    const buffer = await generarReportePDF(report);
    this.logger.log(`PDF Flujo de Efectivo generado para empresa #${empresa?.id}`);
    return { buffer, filename: this.nombreArchivo(fe, 'pdf') };
  }
}
