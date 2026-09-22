import { Injectable } from '@nestjs/common';
import { DeclaracionesService } from './declaraciones.service';
import { AnexoAService } from './anexo-a.service';
import { generarReportePDF } from '../common/pdf/tabular-pdf.helper';
import type { TabularReportData } from '../common/pdf/tabular-pdf.helper';
import { LABELS_ANEXO_A } from './anexo-a-labels';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n: number) {
  return 'RD$ ' + new Intl.NumberFormat('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);
}

@Injectable()
export class DeclaracionesPdfService {
  constructor(
    private readonly svc: DeclaracionesService,
    private readonly anexoA: AnexoAService,
  ) {}

  /** Recorre un objeto de sección (posiblemente con subgrupos anidados) y saca cada {casilla,monto,estado,cantidad} — mismo criterio que el frontend (CasillaTable.tsx). */
  private flattenCasillas(obj: any): { casilla: number; monto: number; estado?: string; cantidad?: number }[] {
    const out: { casilla: number; monto: number; estado?: string; cantidad?: number }[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.casilla === 'number' && typeof node.monto === 'number') { out.push(node); return; }
      for (const k of Object.keys(node)) {
        if (k === 'avisos' || k.startsWith('_')) continue;
        walk(node[k]);
      }
    };
    walk(obj);
    return out.sort((a, b) => a.casilla - b.casilla);
  }

  // ── 606 ──────────────────────────────────────────────────────────────────────

  async generar606(mes: number, anio: number): Promise<Buffer> {
    const data = await this.svc.getFormato606(mes, anio);
    const rnc  = await this.svc.getRnc();
    const filas: any[] = data.filas ?? [];

    const report: TabularReportData = {
      titulo:     'Formato 606',
      subtitulo:  'Compras y Servicios',
      periodo:    `${MESES[mes - 1]} ${anio}`,
      rnc,
      empresa:    'REPORTE FISCAL — DGII · República Dominicana',
      summaryCards: [
        { label: 'Total Registros', value: String(filas.length) },
        { label: 'Monto Total',     value: fmt(data.totalMonto ?? 0) },
        { label: 'ITBIS Total',     value: fmt(data.totalITBIS ?? 0) },
      ],
      columns: [
        { header: 'Línea',        key: 'linea',            width: 6,  align: 'center' },
        { header: 'RNC Proveedor',key: 'rncProveedor',     width: 15 },
        { header: 'Tipo ID',      key: 'tipoId',           width: 8,  align: 'center' },
        { header: 'NCF',          key: 'ncf',              width: 16 },
        { header: 'Fecha',        key: 'fechaComprobante', width: 10, date: true, align: 'center' },
        { header: 'Monto',        key: 'montoFacturado',   width: 15, money: true, align: 'right' },
        { header: 'ITBIS',        key: 'itbis',            width: 15, money: true, align: 'right' },
        { header: 'Ret. ISR',     key: 'retencionISR',     width: 15, money: true, align: 'right' },
      ],
      rows: filas,
      totalRow: filas.length > 0 ? {
        linea:        'TOTALES',
        montoFacturado: data.totalMonto ?? 0,
        itbis:          data.totalITBIS ?? 0,
        retencionISR:   0,
      } : undefined,
    };

    return generarReportePDF(report);
  }

  // ── 607 ──────────────────────────────────────────────────────────────────────

  async generar607(mes: number, anio: number): Promise<Buffer> {
    const data   = await this.svc.getFormato607(mes, anio);
    const rnc    = await this.svc.getRnc();
    const filas: any[] = data.filas ?? [];
    const totales = data.totales ?? { montoFacturado: 0, itbis: 0 };

    const report: TabularReportData = {
      titulo:    'Formato 607',
      subtitulo: 'Registro de Ventas y Prestación de Servicios',
      periodo:   `${MESES[mes - 1]} ${anio}`,
      rnc,
      empresa:   'REPORTE FISCAL — DGII · República Dominicana',
      summaryCards: [
        { label: 'Total Registros', value: String(filas.length) },
        { label: 'Monto Total',     value: fmt(totales.montoFacturado ?? 0) },
        { label: 'ITBIS Total',     value: fmt(totales.itbis ?? 0) },
      ],
      columns: [
        { header: 'Línea',       key: 'linea',            width: 6,  align: 'center' },
        { header: 'RNC Comprador',key: 'rncComprador',    width: 15 },
        { header: 'Tipo ID',     key: 'tipoId',           width: 8,  align: 'center' },
        { header: 'NCF',         key: 'ncf',              width: 16 },
        { header: 'Tipo NCF',    key: 'tipoNcf',          width: 10, align: 'center' },
        { header: 'Fecha',       key: 'fechaComprobante', width: 10, date: true, align: 'center' },
        { header: 'Monto',       key: 'montoFacturado',   width: 15, money: true, align: 'right' },
        { header: 'ITBIS',       key: 'itbis',            width: 15, money: true, align: 'right' },
      ],
      rows: filas,
      totalRow: filas.length > 0 ? {
        linea:          'TOTALES',
        montoFacturado: totales.montoFacturado ?? 0,
        itbis:          totales.itbis ?? 0,
      } : undefined,
    };

    return generarReportePDF(report);
  }

  // ── 608 ──────────────────────────────────────────────────────────────────────

  async generar608(mes: number, anio: number): Promise<Buffer> {
    const data  = await this.svc.getFormato608(mes, anio);
    const rnc   = await this.svc.getRnc();
    const comps: any[] = data.comprobantes ?? (data as any).filas ?? [];
    const totalCancelado = comps.reduce((s: number, f: any) => s + Number(f.total || 0), 0);

    const report: TabularReportData = {
      titulo:    'Formato 608',
      subtitulo: 'Comprobantes Fiscales Anulados',
      periodo:   `${MESES[mes - 1]} ${anio}`,
      rnc,
      empresa:   'REPORTE FISCAL — DGII · República Dominicana',
      summaryCards: [
        { label: 'Comprobantes Anulados', value: String(comps.length) },
        { label: 'Monto Total Anulado',   value: fmt(totalCancelado), red: true },
      ],
      columns: [
        { header: 'Línea',            key: '_idx',             width: 6,  align: 'center' },
        { header: 'NCF',              key: 'folio',            width: 18 },
        { header: 'Tipo NCF',         key: 'tipoNcf',          width: 10, align: 'center' },
        { header: 'Fecha Emisión',    key: 'fecha',            width: 12, date: true, align: 'center' },
        { header: 'Fecha Anulación',  key: 'fechaCancelacion', width: 12, date: true, align: 'center' },
        { header: 'Monto',            key: 'total',            width: 14, money: true, align: 'right' },
      ],
      rows: comps.map((c, i) => ({ ...c, _idx: i + 1 })),
      totalRow: comps.length > 0 ? { _idx: 'TOTAL', total: totalCancelado } : undefined,
    };

    return generarReportePDF(report);
  }

  // ── IT-1 ─────────────────────────────────────────────────────────────────────

  async generarIT1(mes: number, anio: number): Promise<Buffer> {
    const data = await this.svc.getIT1(mes, anio);
    const rnc  = await this.svc.getRnc();

    const ventas       = Number(data.ventas.total        ?? 0);
    const compras      = Number(data.compras.subtotal    ?? 0);
    const itbisCobrado = Number(data.liquidacion.itbisDebito  ?? 0);
    const itbisPagado  = Number(data.liquidacion.itbisCredito ?? 0);
    const itbisNeto    = Number(data.liquidacion.itbisNeto    ?? 0);
    const estado       = data.liquidacion.estado ?? (itbisNeto > 0 ? 'A PAGAR' : 'A FAVOR');

    const report: TabularReportData = {
      titulo:    'IT-1',
      subtitulo: 'Declaración Jurada del ITBIS',
      periodo:   `${MESES[mes - 1]} ${anio}`,
      rnc,
      empresa:   'REPORTE FISCAL — DGII · República Dominicana',
      summaryCards: [
        { label: 'Ventas Gravadas',    value: fmt(ventas) },
        { label: 'ITBIS Cobrado (18%)',value: fmt(itbisCobrado) },
        { label: 'Compras Gravadas',   value: fmt(compras) },
        { label: 'ITBIS Pagado',       value: fmt(itbisPagado) },
      ],
      columns: [
        { header: 'Concepto', key: 'concepto', width: 70 },
        { header: 'Monto',    key: 'monto',    width: 30, money: true, align: 'right' },
      ],
      rows: [
        { concepto: 'ITBIS Cobrado en Ventas',  monto: itbisCobrado },
        { concepto: 'Crédito Fiscal (Compras)', monto: itbisPagado  },
      ],
      totalRow: {
        concepto: `ITBIS NETO — ${estado}`,
        monto:    Math.abs(itbisNeto),
      },
    };

    return generarReportePDF(report);
  }

  // ── Anexo A del IT-1 (ITBIS) — Commit 5 del rebuild ───────────────────────────

  async generarAnexoAItbis(mes: number, anio: number): Promise<Buffer> {
    const data = await this.anexoA.getAnexoA(mes, anio);
    const rnc  = await this.svc.getRnc();

    const ESTADO_TEXTO: Record<string, string> = {
      calculada: '', no_aplica: 'No aplica', requiere_revision: 'Requiere revisión',
    };

    const rows: Record<string, any>[] = [];
    const seccion = (titulo: string, obj: any) => {
      rows.push({ casilla: '', concepto: titulo.toUpperCase(), monto: null, estado: '' });
      for (const r of this.flattenCasillas(obj)) {
        rows.push({
          casilla: `#${r.casilla}`,
          concepto: LABELS_ANEXO_A[r.casilla] ?? `Casilla ${r.casilla}`,
          monto: r.monto,
          estado: ESTADO_TEXTO[r.estado ?? 'calculada'] ?? r.estado ?? '',
        });
      }
    };

    seccion('Sección II — por Tipo de NCF', data.seccionII);
    seccion('Sección III — por Forma de Pago', data.seccionIII);
    seccion('Sección IV — por Tipo de Ingreso', data.seccionIV);
    seccion('Sección IX — ITBIS Pagado', data.seccionIX);

    const casilla56 = this.flattenCasillas(data.seccionIX).find(r => r.casilla === 56);

    const report: TabularReportData = {
      titulo:    'Anexo A',
      subtitulo: 'Anexo A del IT-1 — ITBIS',
      periodo:   `${MESES[mes - 1]} ${anio}`,
      rnc,
      empresa:   'REPORTE FISCAL — DGII · República Dominicana',
      summaryCards: [
        { label: 'Total ITBIS Deducible (Casilla 56)', value: fmt(casilla56?.monto ?? 0) },
      ],
      columns: [
        { header: 'Casilla',  key: 'casilla',  width: 12, align: 'center' },
        { header: 'Concepto', key: 'concepto', width: 58 },
        { header: 'Monto',    key: 'monto',    width: 18, money: true, align: 'right' },
        { header: 'Estado',   key: 'estado',   width: 12 },
      ],
      rows,
    };

    return generarReportePDF(report);
  }

  // ── Alias para compatibilidad con el controlador ──────────────────────────────

  private fmtDate(d: any): string {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-DO'); } catch { return String(d); }
  }
}
