import { Injectable } from '@nestjs/common';
import { DeclaracionesService } from './declaraciones.service';
import { BrowserService } from '../common/services/browser.service';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function headerHTML(titulo: string, rnc: string, mes: number, anio: number, subtitulo = '') {
  return `
  <div class="header">
    <div class="logo-area">
      <div class="company-name">REPORTE FISCAL — DGII</div>
      <div class="subtitle">República Dominicana</div>
    </div>
    <div class="report-info">
      <div class="title">${titulo}</div>
      ${subtitulo ? `<div class="sub">${subtitulo}</div>` : ''}
      <div class="period">Período: <strong>${MESES[mes - 1]} ${anio}</strong></div>
      <div class="rnc">RNC: <strong>${rnc}</strong></div>
      <div class="generated">Generado: ${new Date().toLocaleString('es-DO')}</div>
    </div>
  </div>`;
}

const BASE_CSS = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9px; color: #222; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 2px solid #1a3c8f; padding-bottom: 8px; margin-bottom: 12px; }
    .logo-area .company-name { font-size: 13px; font-weight: bold; color: #1a3c8f; }
    .logo-area .subtitle { font-size: 9px; color: #666; margin-top: 2px; }
    .report-info { text-align: right; }
    .report-info .title { font-size: 14px; font-weight: bold; color: #1a3c8f; }
    .report-info .sub { font-size: 10px; color: #444; margin-top: 2px; }
    .report-info .period, .report-info .rnc { font-size: 10px; margin-top: 3px; }
    .report-info .generated { font-size: 8px; color: #888; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    thead tr { background: #1a3c8f; color: #fff; }
    thead th { padding: 5px 4px; text-align: left; font-size: 8px; font-weight: 600; }
    thead th.right { text-align: right; }
    tbody tr:nth-child(even) { background: #f4f6fb; }
    tbody tr:hover { background: #e8edf7; }
    tbody td { padding: 4px 4px; font-size: 8px; border-bottom: 1px solid #e0e0e0; }
    tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.center { text-align: center; }
    .totals { background: #eef2fb; border-top: 2px solid #1a3c8f; }
    .totals td { font-weight: bold; font-size: 9px; padding: 5px 4px; }
    .summary { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .summary-card { background: #f4f6fb; border: 1px solid #d0d8f0; border-radius: 4px;
                    padding: 8px 12px; min-width: 140px; }
    .summary-card .label { font-size: 8px; color: #666; }
    .summary-card .value { font-size: 14px; font-weight: bold; color: #1a3c8f; margin-top: 2px; }
    .summary-card .value.red { color: #c0392b; }
    .footer { border-top: 1px solid #ccc; padding-top: 6px; text-align: center;
              font-size: 7px; color: #999; margin-top: 12px; }
    .page { padding: 20px 24px; }
    .empty { text-align: center; color: #888; padding: 30px; font-size: 11px; }
  </style>`;

@Injectable()
export class DeclaracionesPdfService {
  constructor(
    private readonly svc: DeclaracionesService,
    private readonly browserSvc: BrowserService,
  ) {}

  async generar606(mes: number, anio: number): Promise<Buffer> {
    const data = await this.svc.getFormato606(mes, anio);
    const rnc  = await this.svc.getRnc();
    const html = this.html606(data, rnc, mes, anio);
    return this.render(html);
  }

  async generar607(mes: number, anio: number): Promise<Buffer> {
    const data = await this.svc.getFormato607(mes, anio);
    const rnc  = await this.svc.getRnc();
    const html = this.html607(data, rnc, mes, anio);
    return this.render(html);
  }

  async generar608(mes: number, anio: number): Promise<Buffer> {
    const data = await this.svc.getFormato608(mes, anio);
    const rnc  = await this.svc.getRnc();
    const html = this.html608(data, rnc, mes, anio);
    return this.render(html);
  }

  async generarIT1(mes: number, anio: number): Promise<Buffer> {
    const data = await this.svc.getIT1(mes, anio);
    const rnc  = await this.svc.getRnc();
    const html = this.htmlIT1(data, rnc, mes, anio);
    return this.render(html);
  }

  // ── HTML generators ────────────────────────────────────────────────────────

  private html606(data: any, rnc: string, mes: number, anio: number): string {
    const filas: any[] = data.filas ?? [];
    const rows = filas.length === 0
      ? `<tr><td colspan="8" class="empty">Sin compras registradas en el período</td></tr>`
      : filas.map((f: any) => `
        <tr>
          <td class="center">${f.linea}</td>
          <td>${f.rncProveedor || '—'}</td>
          <td class="center">${f.tipoId}</td>
          <td>${f.ncf || '—'}</td>
          <td class="center">${this.fmtDate(f.fechaComprobante)}</td>
          <td class="right">${fmt(f.montoFacturado)}</td>
          <td class="right">${fmt(f.itbis)}</td>
          <td class="right">${fmt(f.retencionISR || 0)}</td>
        </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body><div class="page">
      ${headerHTML('Formato 606', rnc, mes, anio, 'Compras y Servicios')}
      <div class="summary">
        <div class="summary-card"><div class="label">Total Registros</div><div class="value">${filas.length}</div></div>
        <div class="summary-card"><div class="label">Monto Total</div><div class="value">RD$ ${fmt(data.totalMonto)}</div></div>
        <div class="summary-card"><div class="label">ITBIS Total</div><div class="value">RD$ ${fmt(data.totalITBIS)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th class="right" style="width:30px">Línea</th>
          <th>RNC Proveedor</th><th>Tipo ID</th><th>NCF</th>
          <th class="center">Fecha</th>
          <th class="right">Monto</th><th class="right">ITBIS</th><th class="right">Ret. ISR</th>
        </tr></thead>
        <tbody>
          ${rows}
          ${filas.length > 0 ? `<tr class="totals">
            <td colspan="5" style="text-align:right">TOTALES</td>
            <td class="right">RD$ ${fmt(data.totalMonto)}</td>
            <td class="right">RD$ ${fmt(data.totalITBIS)}</td>
            <td class="right">RD$ 0.00</td>
          </tr>` : ''}
        </tbody>
      </table>
      <div class="footer">HiCloud ERP — Formato 606 DGII — ${MESES[mes-1]} ${anio} — RNC: ${rnc}</div>
    </div></body></html>`;
  }

  private html607(data: any, rnc: string, mes: number, anio: number): string {
    const filas: any[] = data.filas ?? [];
    const totales = data.totales ?? { montoFacturado: 0, itbis: 0 };
    const rows = filas.length === 0
      ? `<tr><td colspan="8" class="empty">Sin ventas registradas en el período</td></tr>`
      : filas.map((f: any) => `
        <tr>
          <td class="center">${f.linea}</td>
          <td>${f.rncComprador || '—'}</td>
          <td class="center">${f.tipoId}</td>
          <td>${f.ncf || f.folio || '—'}</td>
          <td class="center">${f.tipoNcf || '—'}</td>
          <td class="center">${this.fmtDate(f.fechaComprobante)}</td>
          <td class="right">${fmt(f.montoFacturado)}</td>
          <td class="right">${fmt(f.itbis)}</td>
        </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body><div class="page">
      ${headerHTML('Formato 607', rnc, mes, anio, 'Registro de Ventas y Prestación de Servicios')}
      <div class="summary">
        <div class="summary-card"><div class="label">Total Registros</div><div class="value">${filas.length}</div></div>
        <div class="summary-card"><div class="label">Monto Total</div><div class="value">RD$ ${fmt(totales.montoFacturado)}</div></div>
        <div class="summary-card"><div class="label">ITBIS Total</div><div class="value">RD$ ${fmt(totales.itbis)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px">Línea</th>
          <th>RNC Comprador</th><th>Tipo ID</th><th>NCF</th><th>Tipo NCF</th>
          <th class="center">Fecha</th>
          <th class="right">Monto</th><th class="right">ITBIS</th>
        </tr></thead>
        <tbody>
          ${rows}
          ${filas.length > 0 ? `<tr class="totals">
            <td colspan="6" style="text-align:right">TOTALES</td>
            <td class="right">RD$ ${fmt(totales.montoFacturado)}</td>
            <td class="right">RD$ ${fmt(totales.itbis)}</td>
          </tr>` : ''}
        </tbody>
      </table>
      <div class="footer">HiCloud ERP — Formato 607 DGII — ${MESES[mes-1]} ${anio} — RNC: ${rnc}</div>
    </div></body></html>`;
  }

  private html608(data: any, rnc: string, mes: number, anio: number): string {
    const comprobantes: any[] = data.comprobantes ?? data.filas ?? [];
    const rows = comprobantes.length === 0
      ? `<tr><td colspan="6" class="empty">Sin comprobantes anulados en el período</td></tr>`
      : comprobantes.map((f: any, i: number) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${f.folio || f.ncf || '—'}</td>
          <td class="center">${f.tipoNcf || '—'}</td>
          <td class="center">${this.fmtDate(f.fecha)}</td>
          <td class="center">${this.fmtDate(f.fechaCancelacion || f.fecha)}</td>
          <td class="right">${fmt(Number(f.total || 0))}</td>
        </tr>`).join('');

    const totalCancelado = comprobantes.reduce((s: number, f: any) => s + Number(f.total || 0), 0);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body><div class="page">
      ${headerHTML('Formato 608', rnc, mes, anio, 'Comprobantes Fiscales Anulados')}
      <div class="summary">
        <div class="summary-card"><div class="label">Comprobantes Anulados</div><div class="value">${comprobantes.length}</div></div>
        <div class="summary-card"><div class="label">Monto Total Anulado</div><div class="value red">RD$ ${fmt(totalCancelado)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px">Línea</th>
          <th>NCF</th><th class="center">Tipo NCF</th>
          <th class="center">Fecha Emisión</th><th class="center">Fecha Anulación</th>
          <th class="right">Monto</th>
        </tr></thead>
        <tbody>
          ${rows}
          ${comprobantes.length > 0 ? `<tr class="totals">
            <td colspan="5" style="text-align:right">TOTAL ANULADO</td>
            <td class="right">RD$ ${fmt(totalCancelado)}</td>
          </tr>` : ''}
        </tbody>
      </table>
      <div class="footer">HiCloud ERP — Formato 608 DGII — ${MESES[mes-1]} ${anio} — RNC: ${rnc}</div>
    </div></body></html>`;
  }

  private htmlIT1(data: any, rnc: string, mes: number, anio: number): string {
    const it1 = data.it1 ?? data;
    const ventas  = it1.ventasGravadas ?? 0;
    const compras = it1.comprasGravadas ?? 0;
    const itbisCobrado  = it1.itbisCobrado ?? it1.itbisVentas ?? 0;
    const itbisPagado   = it1.itbisPagado  ?? it1.itbisCompras ?? 0;
    const itbisNeto     = it1.itbisNeto ?? (itbisCobrado - itbisPagado);
    const estado        = it1.estado ?? (itbisNeto > 0 ? 'A PAGAR' : 'A FAVOR');
    const estadoColor   = itbisNeto > 0 ? '#c0392b' : '#27ae60';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body><div class="page">
      ${headerHTML('IT-1', rnc, mes, anio, 'Declaración Jurada del Impuesto sobre Transferencias de Bienes y Servicios')}
      <div class="summary">
        <div class="summary-card"><div class="label">Ventas Gravadas</div><div class="value">RD$ ${fmt(ventas)}</div></div>
        <div class="summary-card"><div class="label">ITBIS Cobrado (18%)</div><div class="value">RD$ ${fmt(itbisCobrado)}</div></div>
        <div class="summary-card"><div class="label">Compras Gravadas</div><div class="value">RD$ ${fmt(compras)}</div></div>
        <div class="summary-card"><div class="label">ITBIS Pagado (Crédito)</div><div class="value">RD$ ${fmt(itbisPagado)}</div></div>
      </div>
      <table style="max-width:400px">
        <tbody>
          <tr><td style="padding:6px 8px;font-weight:600;border-bottom:1px solid #e0e0e0">ITBIS Cobrado en Ventas</td>
              <td class="right" style="padding:6px 8px;border-bottom:1px solid #e0e0e0">RD$ ${fmt(itbisCobrado)}</td></tr>
          <tr style="background:#f4f6fb"><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">Crédito Fiscal (Compras)</td>
              <td class="right" style="padding:6px 8px;border-bottom:1px solid #e0e0e0">RD$ (${fmt(itbisPagado)})</td></tr>
          <tr class="totals"><td style="padding:6px 8px">ITBIS NETO</td>
              <td class="right" style="padding:6px 8px;color:${estadoColor};font-size:12px">RD$ ${fmt(Math.abs(itbisNeto))}</td></tr>
        </tbody>
      </table>
      <div style="margin-top:12px;padding:10px 14px;background:#f4f6fb;border-left:4px solid ${estadoColor};border-radius:4px;display:inline-block">
        <span style="font-size:11px;font-weight:bold;color:${estadoColor}">${estado}: RD$ ${fmt(Math.abs(itbisNeto))}</span>
      </div>
      <div class="footer">HiCloud ERP — IT-1 DGII — ${MESES[mes-1]} ${anio} — RNC: ${rnc}</div>
    </div></body></html>`;
  }

  // ── Puppeteer render ───────────────────────────────────────────────────────

  private async render(html: string): Promise<Buffer> {
    return this.browserSvc.htmlToPDF(html);
  }

  private fmtDate(d: any): string {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-DO'); } catch { return String(d); }
  }
}
