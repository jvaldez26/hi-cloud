import { Injectable, Logger } from '@nestjs/common';
import { ReportesFinancierosService } from './reportes-financieros.service';
import { TenantService } from '../tenant/tenant.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { BrowserService } from '../common/services/browser.service';

const FMT = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(n ?? 0);

const COLOR = '#1a56db';
const GREEN = '#059669';
const RED   = '#dc2626';
const GRAY  = '#6b7280';

function esc(s: string | undefined | null): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function baseHtml(titulo: string, subtitulo: string, empresa: any, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
<title>${esc(titulo)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
  .header { background: linear-gradient(135deg, ${COLOR}, #0ea5e9); color: #fff; padding: 24px 32px 20px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .empresa-nombre { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
  .empresa-rnc { font-size: 11px; opacity: .8; }
  .reporte-tipo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: .7; margin-bottom: 4px; }
  .reporte-titulo { font-size: 22px; font-weight: 900; }
  .reporte-sub { font-size: 12px; opacity: .8; margin-top: 4px; }
  .content { padding: 24px 32px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .section-header { background: #f1f5f9; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #374151; padding: 8px 10px; border-left: 3px solid ${COLOR}; }
  .row-item td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; color: #374151; }
  .row-item .amount { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  .row-subtotal td { padding: 7px 10px; background: #f8fafc; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
  .row-subtotal .amount { text-align: right; font-variant-numeric: tabular-nums; }
  .row-total td { padding: 10px 12px; background: ${COLOR}; color: #fff; font-weight: 900; font-size: 13px; }
  .row-total .amount { text-align: right; font-variant-numeric: tabular-nums; }
  .positive { color: ${GREEN}; }
  .negative { color: ${RED}; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: ${GRAY}; font-size: 10px; }
  @page { margin: 10mm 12mm; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div>
        <div class="empresa-nombre">${esc(empresa?.nombreComercial || empresa?.nombre)}</div>
        ${empresa?.rnc ? `<div class="empresa-rnc">RNC: ${esc(empresa.rnc)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="reporte-tipo">Reporte Financiero</div>
        <div class="reporte-titulo">${esc(titulo)}</div>
        <div class="reporte-sub">${esc(subtitulo)}</div>
      </div>
    </div>
  </div>
  <div class="content">
    ${cuerpo}
    <div class="footer">
      <span>Generado: ${new Date().toLocaleString('es-DO')}</span>
      <span>HiCloud ERP · ${esc(empresa?.nombre)}</span>
    </div>
  </div>
</body>
</html>`;
}

@Injectable()
export class ReportesPdfService {
  private readonly logger = new Logger(ReportesPdfService.name);

  constructor(
    private svc:         ReportesFinancierosService,
    private tenantSvc:   TenantService,
    @InjectRepository(Empresa) private empresaRepo: Repository<Empresa>,
    private browserSvc:  BrowserService,
  ) {}

  private async getEmpresa(): Promise<Empresa | null> {
    try {
      const id = this.tenantSvc.getEmpresaId();
      return await this.empresaRepo.findOne({ where: { id, isActive: true } });
    } catch { return null; }
  }

  private async htmlToPDF(html: string): Promise<Buffer> {
    return this.browserSvc.htmlToPDF(html);
  }

  // ── Estado de Resultados ───────────────────────────────────────────────────

  async generarEstadoResultadosPDF(desde: string, hasta: string): Promise<{ buffer: Buffer; filename: string }> {
    const [er, empresa] = await Promise.all([
      this.svc.estadoResultados(desde, hasta),
      this.getEmpresa(),
    ]);

    const fil = (desde: string, hasta: string) =>
      `${new Date(desde + 'T12:00:00').toLocaleDateString('es-DO',{day:'2-digit',month:'long',year:'numeric'})} al ${new Date(hasta + 'T12:00:00').toLocaleDateString('es-DO',{day:'2-digit',month:'long',year:'numeric'})}`;

    const filas = (grupo: any[], nivel = 0): string => grupo.map(c => {
      const indent = nivel * 20;
      const esGrupo = c.subcuentas?.length > 0;
      if (esGrupo) {
        return `<tr class="section-header"><td colspan="2" style="padding-left:${indent + 10}px">${esc(c.nombre)}</td></tr>
          ${filas(c.subcuentas, nivel + 1)}
          <tr class="row-subtotal"><td style="padding-left:${indent + 10}px">Subtotal ${esc(c.nombre)}</td><td class="amount" style="${Number(c.total ?? 0) >= 0 ? `color:${GREEN}` : `color:${RED}`}">${FMT(Number(c.total ?? 0))}</td></tr>`;
      }
      return `<tr class="row-item"><td style="padding-left:${indent + 10}px">${esc(c.nombre)}</td><td class="amount">${FMT(Number(c.total ?? c.saldo ?? 0))}</td></tr>`;
    }).join('');

    // er.resultados contiene utilidadBruta, utilidadOperativa, utilidadNeta, etc.
    const utilidad = Number((er as any).resultados?.utilidadNeta ?? (er as any).utilidadNeta ?? 0);
    const cuerpo = `
      <table>
        ${['ingresos','costos','gastos'].filter(k => (er as any)[k]).map((k: string) => {
          const sec = (er as any)[k];
          const label = k === 'ingresos' ? 'INGRESOS' : k === 'costos' ? 'COSTOS' : 'GASTOS';
          return `<tr class="section-header"><td colspan="2">${label}</td></tr>
            ${(sec.cuentas ?? []).map((c: any) => `<tr class="row-item"><td style="padding-left:20px">${esc(c.nombre)}</td><td class="amount">${FMT(Number(c.saldo ?? 0))}</td></tr>`).join('')}
            <tr class="row-subtotal"><td><strong>Total ${label}</strong></td><td class="amount"><strong>${FMT(Number(sec.total ?? 0))}</strong></td></tr>`;
        }).join('')}
        <tr class="row-total">
          <td>UTILIDAD ${utilidad >= 0 ? 'NETA' : '(PÉRDIDA)'}</td>
          <td class="amount">${FMT(Math.abs(utilidad))}</td>
        </tr>
      </table>`;

    const html   = baseHtml('Estado de Resultados', fil(desde, hasta), empresa, cuerpo);
    const buffer = await this.htmlToPDF(html);
    this.logger.log(`PDF Estado de Resultados generado para empresa #${empresa?.id}`);
    return { buffer, filename: `Estado-Resultados-${desde}-${hasta}.pdf` };
  }

  // ── Balance General ────────────────────────────────────────────────────────

  async generarBalanceGeneralPDF(fechaCorte: string): Promise<{ buffer: Buffer; filename: string }> {
    const [bg, empresa] = await Promise.all([
      this.svc.balanceGeneral(fechaCorte),
      this.getEmpresa(),
    ]);

    const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

    const seccion = (titulo: string, items: any[], total: number, color: string): string => `
      <tr class="section-header"><td colspan="2">${esc(titulo)}</td></tr>
      ${(items ?? []).map((i: any) => `
        <tr class="row-item">
          <td style="padding-left:20px">${esc(i.nombre ?? i.cuenta)}</td>
          <td class="amount">${FMT(Number(i.saldo ?? i.total ?? 0))}</td>
        </tr>`).join('')}
      <tr class="row-subtotal">
        <td><strong>Total ${esc(titulo)}</strong></td>
        <td class="amount" style="color:${color}"><strong>${FMT(total)}</strong></td>
      </tr>`;

    const activos    = Number((bg as any).totales?.activos ?? (bg as any).activo?.total    ?? 0);
    const pasivos    = Number((bg as any).totales?.pasivosPatrimonio ?? (bg as any).pasivo?.total ?? 0) - Number((bg as any).patrimonio?.total ?? 0);
    const patrimonio = Number((bg as any).patrimonio?.total ?? 0);

    const flatCuentas = (obj: any): any[] =>
      obj?.cuentas ?? [
        ...((obj?.corriente?.cuentas ?? [])),
        ...((obj?.noCorriente?.cuentas ?? [])),
      ];

    const cuerpo = `
      <table>
        ${seccion('ACTIVOS',    flatCuentas((bg as any).activo),    activos,    GREEN)}
        ${seccion('PASIVOS',    flatCuentas((bg as any).pasivo),    pasivos,    RED)}
        ${seccion('PATRIMONIO', flatCuentas((bg as any).patrimonio), patrimonio, COLOR)}
        <tr class="row-total">
          <td>TOTAL PASIVOS + PATRIMONIO</td>
          <td class="amount">${FMT(pasivos + patrimonio)}</td>
        </tr>
      </table>
      <p style="margin-top:12px;font-size:10px;color:${GRAY};text-align:right">
        ${Math.abs(activos - (pasivos + patrimonio)) < 0.01 ? '✅ Balance cuadra correctamente' : `⚠️ Diferencia: ${FMT(Math.abs(activos - (pasivos + patrimonio)))}`}
      </p>`;

    const html   = baseHtml('Balance General', `Al ${fmtDate(fechaCorte)}`, empresa, cuerpo);
    const buffer = await this.htmlToPDF(html);
    this.logger.log(`PDF Balance General generado para empresa #${empresa?.id}`);
    return { buffer, filename: `Balance-General-${fechaCorte}.pdf` };
  }
}
