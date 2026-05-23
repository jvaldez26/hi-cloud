import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as https from 'https';
import * as http  from 'http';
import { Compra } from './entities/compra.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { BrowserService } from '../common/services/browser.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(n: number | string | null | undefined): string {
  return 'RD$ ' + Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  } catch { return String(d); }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ComprasPdfService {
  private readonly logger = new Logger(ComprasPdfService.name);

  constructor(
    @InjectRepository(Compra)  private compraRepo:  Repository<Compra>,
    @InjectRepository(Empresa) private empresaRepo: Repository<Empresa>,
    private tenantService: TenantService,
    private browserSvc: BrowserService,
  ) {}

  private async resolverLogo(url: string | undefined | null): Promise<string> {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (!url.startsWith('http')) return '';
    return new Promise((resolve) => {
      const lib = url.startsWith('https') ? https : http;
      lib.get(url, (res) => {
        const ct = res.headers['content-type'] ?? 'image/jpeg';
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end',  () => resolve(`data:${ct};base64,${Buffer.concat(chunks).toString('base64')}`));
        res.on('error', () => resolve(''));
      }).on('error', () => resolve(''));
    });
  }

  async generarOrdenCompraPDF(compraId: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantService.getEmpresaId();

    const compra = await this.compraRepo.findOne({
      where: { id: compraId, empresaId, isActive: true },
      relations: ['proveedor', 'detalles', 'detalles.producto', 'usuario'],
    });
    if (!compra) throw new NotFoundException(`Compra #${compraId} no encontrada`);

    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId, isActive: true } });

    const logoSrc = await this.resolverLogo(empresa?.logo);

    // ── Constantes de diseño (mismo que factura) ──────────────────────────
    const DARK   = '#111111';
    const THEAD  = '#2d2d2d';
    const GRAY   = '#555555';
    const LGRAY  = '#f5f5f5';
    const BORDER = '#aaaaaa';
    const GREEN  = '#15803D';

    // ── Estado badge ──────────────────────────────────────────────────────
    const estadoBg: Record<string, string> = {
      recibida: '#dcfce7', pagada: '#dbeafe', pendiente: '#fef3c7', anulada: '#fee2e2',
    };
    const estadoTx: Record<string, string> = {
      recibida: '#15803d', pagada: '#1d4ed8', pendiente: '#92400e', anulada: '#991b1b',
    };
    const est = (compra.estado ?? 'pendiente').toLowerCase();
    const estadoHtml = `<span style="background:${estadoBg[est] ?? '#f5f5f5'};color:${estadoTx[est] ?? GRAY};font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;">${esc(compra.estado ?? '')}</span>`;

    // ── Logo ──────────────────────────────────────────────────────────────
    const iniciales = (empresa?.nombre ?? 'HC')
      .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" style="height:68px;max-width:150px;object-fit:contain;display:block;flex-shrink:0;" onerror="this.style.display='none'">`
      : `<div style="width:56px;height:56px;background:${DARK};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0;">${iniciales}</div>`;

    // ── Filas de items ────────────────────────────────────────────────────
    const itemRows = (compra.detalles ?? []).map((d, i) => {
      const sub  = Number(d.precioUnitario) * Number(d.cantidad);
      const itbs = sub * (Number(d.porcentajeItbis ?? 18) / 100);
      return `
        <tr style="background:${i % 2 === 0 ? '#fff' : LGRAY};border-bottom:1px solid #e8e8e8;">
          <td style="padding:7px 10px;font-size:10px;color:${DARK};">${esc(d.descripcion)}</td>
          <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${Number(d.cantidad).toLocaleString('es-DO')}</td>
          <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${money(d.precioUnitario)}</td>
          <td style="padding:7px 8px;font-size:10px;color:${GRAY};text-align:center;">${Number(d.porcentajeItbis ?? 18)}%</td>
          <td style="padding:7px 10px;font-size:10px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${money(sub + itbs)}</td>
        </tr>`;
    }).join('');

    const proveedor = (compra as any).proveedor ?? {};
    const empresaNombre = empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa';
    const empresaRNC    = empresa?.rnc ?? '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden de Compra ${esc(compra.folio)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#fff; color:${DARK}; font-size:11px; }
  @page { size:A4; margin:0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  .page { width:794px; min-height:1123px; background:#fff; display:flex; flex-direction:column; padding:28px 36px 24px; }
  table { border-collapse:collapse; width:100%; }
</style>
</head>
<body>
<div class="page">

  <!-- ENCABEZADO -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px;">

    <!-- Izquierda: Logo + empresa -->
    <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
      ${logoHtml}
      <div style="min-width:0;padding-top:2px;">
        <div style="font-size:15px;font-weight:900;color:${DARK};text-transform:uppercase;line-height:1.3;margin-bottom:6px;">${esc(empresaNombre)}</div>
        <div style="font-size:9.5px;color:${GRAY};line-height:1.85;">
          ${empresa?.direccion ? `<div>${esc(empresa.direccion)}${empresa.ciudad ? ', ' + esc(empresa.ciudad) : ''}.</div>` : ''}
          ${empresa?.email     ? `<div>Correo: ${esc(empresa.email)}</div>`   : ''}
          ${empresa?.telefono  ? `<div>Teléfono: ${esc(empresa.telefono)}</div>` : ''}
          <div><strong style="color:${DARK};">RNC: ${esc(empresaRNC)}</strong></div>
        </div>
      </div>
    </div>

    <!-- Derecha: tipo + número + info -->
    <div style="text-align:right;flex-shrink:0;min-width:220px;max-width:250px;">
      <div style="font-size:11px;font-weight:700;color:${DARK};text-transform:uppercase;">ORDEN DE COMPRA</div>
      <div style="font-size:18px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:.5px;margin-top:4px;">${esc(compra.folio)}</div>
      <div style="margin-top:8px;font-size:9.5px;color:${GRAY};line-height:1.85;text-align:right;">
        <div>Fecha: <strong style="color:${DARK};">${fmtDate(compra.fecha)}</strong></div>
        ${(compra as any).usuario?.nombre ? `<div>Elaborado por: <strong style="color:${DARK};">${esc((compra as any).usuario.nombre)}</strong></div>` : ''}
        <div style="margin-top:4px;">${estadoHtml}</div>
      </div>
    </div>
  </div>

  <!-- SEPARADOR -->
  <div style="height:3px;background:${DARK};margin-bottom:12px;"></div>

  <!-- DATOS DEL PROVEEDOR -->
  <div style="border:1px solid ${BORDER};padding:10px 14px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${DARK};margin-bottom:7px;">Datos del Proveedor</div>
    ${proveedor.rnc
      ? `<div style="font-size:10.5px;color:${GRAY};margin-bottom:3px;">RNC o Cédula: <strong style="color:${DARK};">${esc(proveedor.rnc)}</strong></div>`
      : ''}
    <div style="font-size:10.5px;color:${GRAY};">
      Nombre o Razón Social: <strong style="color:${DARK};">${esc(proveedor.nombre || '—')}</strong>
    </div>
    ${(proveedor.telefono || proveedor.email) ? `
    <div style="font-size:9.5px;color:${GRAY};margin-top:3px;">
      ${proveedor.telefono ? `Tel. ${esc(proveedor.telefono)}  ` : ''}
      ${proveedor.email    ? esc(proveedor.email) : ''}
    </div>` : ''}
  </div>

  <!-- TABLA DE ÍTEMS -->
  <table style="margin-bottom:16px;">
    <thead>
      <tr style="background:${THEAD};">
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:left;">Descripción</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:60px;">Cant.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:100px;">Precio Unit.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:center;width:65px;">ITBIS</th>
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:100px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="5" style="padding:20px;text-align:center;color:${GRAY};font-style:italic;">Sin ítems</td></tr>`}
    </tbody>
  </table>

  <!-- TOTALES -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
    <div style="min-width:260px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
        <span style="font-size:10.5px;color:${GRAY};">Subtotal:</span>
        <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${money(compra.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
        <span style="font-size:10.5px;color:${GRAY};">ITBIS (18%):</span>
        <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${money(compra.itbis)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:2px solid ${DARK};margin-top:4px;">
        <span style="font-size:12px;font-weight:700;color:${DARK};">TOTAL ORDEN:</span>
        <span style="font-size:18px;font-weight:900;color:${DARK};font-variant-numeric:tabular-nums;font-family:monospace;">${money(compra.total)}</span>
      </div>
    </div>
  </div>

  ${compra.notas ? `
  <div style="padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">Notas</div>
    <div style="font-size:9.5px;color:#555;line-height:1.6;">${esc(compra.notas)}</div>
  </div>` : ''}

  <!-- FIRMAS -->
  <div style="display:flex;gap:24px;margin-top:auto;padding-top:16px;">
    ${[['Autorizado por', esc(empresaNombre)], ['Aceptado por el Proveedor', esc(proveedor.nombre ?? '')]].map(([label, sub]) => `
      <div style="flex:1;text-align:center;">
        <div style="border-bottom:1px solid ${DARK};margin-bottom:5px;height:36px;"></div>
        <div style="font-size:9px;font-weight:600;color:${DARK};">${label}</div>
        <div style="font-size:9px;color:${GRAY};margin-top:1px;">${sub}</div>
      </div>`).join('')}
  </div>

  <!-- FOOTER -->
  <div style="padding-top:14px;border-top:1px solid #ddd;text-align:center;margin-top:16px;">
    <div style="font-size:10px;color:#555;">¡Gracias por su preferencia!</div>
    ${empresa?.email ? `<div style="font-size:9px;color:#888;margin-top:4px;">${esc(empresa.email)}</div>` : ''}
    <div style="font-size:8.5px;color:#aaa;margin-top:5px;">Documento generado por <strong style="color:#666;">HiCloud ERP</strong></div>
  </div>

</div>
</body>
</html>`;

    const buf = await this.browserSvc.htmlToPDF(html);
    this.logger.log(`PDF Orden de Compra generado: ${compra.folio}`);
    return { buffer: buf, filename: `${compra.folio}.pdf` };
  }
}
