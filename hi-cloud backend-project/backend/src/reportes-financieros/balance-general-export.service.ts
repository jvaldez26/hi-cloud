import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarReportePDF } from '../common/pdf/tabular-pdf.helper';
import type { TabularReportData } from '../common/pdf/tabular-pdf.helper';
import { fechaHoraRD } from '../common/utils/fecha-local.util';
import { BalanceGeneralDetalladoService, FiltrosBalanceGeneralDetallado, BalanceGeneralDetallado } from './balance-general-detallado.service';
import { aplanarNodos, FilaAplanada } from './balance-general-arbol.util';

export interface OpcionesExportBalanceGeneral {
  mostrarCodigo?:            boolean; // default true
  mostrarPorcentajeVertical?: boolean; // default true
}

const FMT = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(n ?? 0);

const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Balance General detallado (2026-09-21) — exportación respetando los
 * filtros y la vista activa (nivel de detalle, comparativo, cuentas en
 * cero, código y % vertical). Las tres salidas parten del MISMO
 * BalanceGeneralDetallado (nunca recalculan nada por su cuenta) aplanado
 * con aplanarNodos(), que conserva la jerarquía como indentación.
 */
@Injectable()
export class BalanceGeneralExportService {
  private readonly logger = new Logger(BalanceGeneralExportService.name);

  constructor(
    private readonly detalladoSvc: BalanceGeneralDetalladoService,
    private readonly tenantSvc: TenantService,
    @InjectRepository(Empresa) private readonly empresaRepo: Repository<Empresa>,
  ) {}

  private async getEmpresa(): Promise<Empresa | null> {
    try {
      const id = this.tenantSvc.getEmpresaId();
      return await this.empresaRepo.findOne({ where: { id, isActive: true } });
    } catch { return null; }
  }

  private filas(bg: BalanceGeneralDetallado): FilaAplanada[] {
    return [
      ...aplanarNodos(bg.activo.nodos, 'ACTIVO'),
      ...aplanarNodos(bg.pasivo.nodos, 'PASIVO'),
      ...aplanarNodos(bg.patrimonio.nodos, 'PATRIMONIO'),
      {
        seccion: 'PATRIMONIO', codigo: '', nombre: '  Resultado del ejercicio (calculado)',
        esCuentaGrupo: false, monto: bg.patrimonio.calculadas.resultadoDelEjercicio.monto,
        porcentajeVertical: bg.patrimonio.total !== 0
          ? +((bg.patrimonio.calculadas.resultadoDelEjercicio.monto / bg.patrimonio.total) * 100).toFixed(1) : 0,
        comparado: bg.patrimonio.calculadas.resultadoDelEjercicio.comparado,
      },
      {
        seccion: 'PATRIMONIO', codigo: '', nombre: '  Resultados acumulados (calculado)',
        esCuentaGrupo: false, monto: bg.patrimonio.calculadas.resultadosAcumulados.monto,
        porcentajeVertical: bg.patrimonio.total !== 0
          ? +((bg.patrimonio.calculadas.resultadosAcumulados.monto / bg.patrimonio.total) * 100).toFixed(1) : 0,
        comparado: bg.patrimonio.calculadas.resultadosAcumulados.comparado,
      },
    ];
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  async generarExcel(
    filtros: FiltrosBalanceGeneralDetallado, opciones: OpcionesExportBalanceGeneral = {},
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [bg, empresa] = await Promise.all([this.detalladoSvc.generar(filtros), this.getEmpresa()]);
    const mostrarCodigo = opciones.mostrarCodigo ?? true;
    const mostrarPct    = opciones.mostrarPorcentajeVertical ?? true;
    const conComparativo = bg.filtros.compararCon !== 'ninguno';

    const encabezado = [
      'Sección',
      ...(mostrarCodigo ? ['Código'] : []),
      'Cuenta',
      'Monto',
      ...(mostrarPct ? ['% Vertical'] : []),
      ...(conComparativo ? ['Comparado', 'Diferencia', '% Diferencia'] : []),
    ];

    const filas = this.filas(bg).map(f => [
      f.seccion,
      ...(mostrarCodigo ? [f.codigo] : []),
      f.nombre,
      f.monto,
      ...(mostrarPct ? [f.porcentajeVertical] : []),
      ...(conComparativo ? [f.comparado ?? 0, f.diferencia ?? 0, f.diferenciaPct ?? ''] : []),
    ]);

    const wb = XLSX.utils.book_new();
    const encabezadoEmpresa = [
      [empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa'],
      [`Balance General — Al ${fmtFecha(bg.fechaCorte)}`],
      [`Generado: ${fechaHoraRD()}`],
      [],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...encabezadoEmpresa, encabezado, ...filas]);
    ws['!cols'] = encabezado.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Balance General');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    this.logger.log(`Excel Balance General detallado generado para empresa #${empresa?.id}`);
    return { buffer, filename: `Balance-General-${bg.fechaCorte}.xlsx` };
  }

  // ── CSV ──────────────────────────────────────────────────────────────────

  private csvEscape(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async generarCsv(
    filtros: FiltrosBalanceGeneralDetallado, opciones: OpcionesExportBalanceGeneral = {},
  ): Promise<{ buffer: Buffer; filename: string }> {
    const bg = await this.detalladoSvc.generar(filtros);
    const mostrarCodigo = opciones.mostrarCodigo ?? true;
    const mostrarPct    = opciones.mostrarPorcentajeVertical ?? true;
    const conComparativo = bg.filtros.compararCon !== 'ninguno';

    const encabezado = [
      'Sección',
      ...(mostrarCodigo ? ['Código'] : []),
      'Cuenta', 'Monto',
      ...(mostrarPct ? ['% Vertical'] : []),
      ...(conComparativo ? ['Comparado', 'Diferencia', '% Diferencia'] : []),
    ];

    const lineas = [
      encabezado.map(h => this.csvEscape(h)).join(','),
      ...this.filas(bg).map(f => [
        f.seccion,
        ...(mostrarCodigo ? [f.codigo] : []),
        f.nombre, f.monto,
        ...(mostrarPct ? [f.porcentajeVertical] : []),
        ...(conComparativo ? [f.comparado ?? 0, f.diferencia ?? 0, f.diferenciaPct ?? ''] : []),
      ].map(v => this.csvEscape(v)).join(',')),
    ];

    // BOM UTF-8 — sin esto Excel abre acentos/ñ como caracteres corruptos.
    const buffer = Buffer.from('﻿' + lineas.join('\r\n'), 'utf8');
    return { buffer, filename: `Balance-General-${bg.fechaCorte}.csv` };
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  async generarPdf(filtros: FiltrosBalanceGeneralDetallado): Promise<{ buffer: Buffer; filename: string }> {
    const [bg, empresa] = await Promise.all([this.detalladoSvc.generar(filtros), this.getEmpresa()]);
    const conComparativo = bg.filtros.compararCon !== 'ninguno';

    const rows: Record<string, any>[] = this.filas(bg).map(f => ({
      seccion: f.seccion, nombre: f.nombre, monto: f.monto,
      comparado: f.comparado, diferencia: f.diferencia,
    }));

    const report: TabularReportData = {
      titulo:    'Balance General',
      subtitulo: `Al ${fmtFecha(bg.fechaCorte)}` + (conComparativo && bg.filtros.fechaComparacion
        ? ` — Comparado con ${fmtFecha(bg.filtros.fechaComparacion)}` : ''),
      empresa:   empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
      rnc:       empresa?.rnc,
      columns: [
        { header: 'Sección', key: 'seccion', width: 13 },
        { header: 'Cuenta',  key: 'nombre',  width: conComparativo ? 37 : 62 },
        { header: 'Monto',   key: 'monto',   width: 25, money: true, align: 'right' },
        ...(conComparativo ? [
          { header: 'Comparado',  key: 'comparado',  width: 12.5, money: true as const, align: 'right' as const },
          { header: 'Diferencia', key: 'diferencia', width: 12.5, money: true as const, align: 'right' as const },
        ] : []),
      ],
      rows,
      summaryCards: [
        { label: 'Total Activos',    value: FMT(bg.activo.total) },
        { label: 'Total Pasivos',    value: FMT(bg.pasivo.total) },
        { label: 'Total Patrimonio', value: FMT(bg.patrimonio.total) },
      ],
      totalRow: {
        seccion: '', nombre: 'TOTAL PASIVOS + PATRIMONIO',
        monto:   bg.totales.pasivosPatrimonio,
      },
    };

    const buffer = await generarReportePDF(report);
    this.logger.log(`PDF Balance General detallado generado para empresa #${empresa?.id}`);
    return { buffer, filename: `Balance-General-${bg.fechaCorte}.pdf` };
  }
}
