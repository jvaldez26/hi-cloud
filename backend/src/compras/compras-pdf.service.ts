import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Compra } from './entities/compra.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(n: number | string | null | undefined): string {
  return `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return String(d); }
}

@Injectable()
export class ComprasPdfService {
  private readonly logger = new Logger(ComprasPdfService.name);

  constructor(
    @InjectRepository(Compra)  private compraRepo:  Repository<Compra>,
    @InjectRepository(Empresa) private empresaRepo: Repository<Empresa>,
    private tenantService: TenantService,
  ) {}

  async generarOrdenCompraPDF(compraId: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantService.getEmpresaId();

    const compra = await this.compraRepo.findOne({
      where: { id: compraId, empresaId, isActive: true },
      relations: ['proveedor', 'detalles', 'detalles.producto', 'usuario'],
    });
    if (!compra) throw new NotFoundException(`Compra #${compraId} no encontrada`);

    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId, isActive: true } });

    const COLOR   = '#7c3aed';
    const LIGHT   = '#f5f3ff';
    const DARK    = '#1e1b4b';
    const GRAY    = '#6b7280';
    const GREEN   = '#059669';

    const itemsHtml = (compra.detalles ?? []).map((d, i) => {
      const sub  = Number(d.precioUnitario) * Number(d.cantidad);
      const itbs = sub * (Number(d.porcentajeItbis ?? 18) / 100);
      return `<tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:9px 12px;font-size:11px;color:${GRAY};">${i + 1}</td>
        <td style="padding:9px 12px;font-size:12px;color:${DARK};">${esc(d.descripcion)}</td>
        <td style="padding:9px 12px;text-align:center;font-size:12px;color:${DARK};">${Number(d.cantidad).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;text-align:right;font-size:12px;color:${DARK};">${money(d.precioUnitario)}</td>
        <td style="padding:9px 12px;text-align:center;font-size:11px;color:${GRAY};">${Number(d.porcentajeItbis ?? 18)}%</td>
        <td style="padding:9px 12px;text-align:right;font-size:12px;font-weight:600;color:${DARK};">${money(sub + itbs)}</td>
      </tr>`;
    }).join('');

    const logoHtml = empresa?.logo
      ? `<img src="${empresa.logo}" alt="Logo" style="max-height:56px;max-width:120px;object-fit:contain;"/>`
      : `<div style="width:56px;height:56px;background:${COLOR}22;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:${COLOR};">${(empresa?.nombre ?? 'E').charAt(0)}</div>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
<title>Orden de Compra ${esc(compra.folio)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: ${DARK}; background: #fff; }
  @page { margin: 10mm 12mm; }
</style>
</head>
<body>

<!-- HEADER -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid ${COLOR};margin-bottom:18px;">
  <div style="display:flex;align-items:center;gap:14px;">
    ${logoHtml}
    <div>
      <div style="font-size:16px;font-weight:800;color:${DARK};">${esc(empresa?.nombreComercial ?? empresa?.nombre)}</div>
      ${empresa?.rnc ? `<div style="font-size:11px;color:${GRAY};">RNC: ${esc(empresa.rnc)}</div>` : ''}
      ${empresa?.telefono ? `<div style="font-size:11px;color:${GRAY};">📞 ${esc(empresa.telefono)}</div>` : ''}
      ${empresa?.email    ? `<div style="font-size:11px;color:${GRAY};">✉️ ${esc(empresa.email)}</div>` : ''}
    </div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:10px;color:${COLOR};font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Orden de Compra</div>
    <div style="font-size:24px;font-weight:900;color:${COLOR};">${esc(compra.folio)}</div>
    <div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
      <span style="background:${LIGHT};border-radius:4px;padding:3px 8px;font-size:11px;font-weight:600;color:${COLOR};">
        Fecha: ${fmtDate(compra.fecha)}
      </span>
      <span style="background:${compra.estado === 'recibida' ? '#d1fae5' : compra.estado === 'pagada' ? '#dbeafe' : '#f5f3ff'};border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;color:${compra.estado === 'recibida' ? GREEN : compra.estado === 'pagada' ? '#1d4ed8' : COLOR};">
        ${compra.estado?.toUpperCase()}
      </span>
    </div>
  </div>
</div>

<!-- PROVEEDOR + INFO -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
  <div style="background:${LIGHT};border-radius:8px;padding:14px 16px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${COLOR};letter-spacing:.5px;margin-bottom:8px;">Proveedor</div>
    <div style="font-weight:700;font-size:13px;color:${DARK};margin-bottom:2px;">${esc((compra as any).proveedor?.nombre)}</div>
    ${(compra as any).proveedor?.rnc ? `<div style="font-size:11px;color:${GRAY};">RNC: ${esc((compra as any).proveedor.rnc)}</div>` : ''}
    ${(compra as any).proveedor?.telefono ? `<div style="font-size:11px;color:${GRAY};">📞 ${esc((compra as any).proveedor.telefono)}</div>` : ''}
    ${(compra as any).proveedor?.email    ? `<div style="font-size:11px;color:${GRAY};">✉️ ${esc((compra as any).proveedor.email)}</div>` : ''}
  </div>
  <div style="background:#f9fafb;border-radius:8px;padding:14px 16px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${GRAY};letter-spacing:.5px;margin-bottom:8px;">Detalles de la Orden</div>
    <div style="display:flex;flex-direction:column;gap:5px;font-size:11px;color:${GRAY};">
      <div><span style="font-weight:600;color:${DARK};">Folio:</span> ${esc(compra.folio)}</div>
      <div><span style="font-weight:600;color:${DARK};">Fecha:</span> ${fmtDate(compra.fecha)}</div>
      ${compra.notas ? `<div><span style="font-weight:600;color:${DARK};">Notas:</span> ${esc(compra.notas)}</div>` : ''}
      ${'generadoPor' in compra && (compra as any).generadoPor ? `<div><span style="font-weight:600;color:${DARK};">Generado por:</span> ${esc((compra as any).usuario?.nombre ?? '')}</div>` : ''}
    </div>
  </div>
</div>

<!-- TABLA DE ÍTEMS -->
<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:14px;">
  <thead>
    <tr style="background:${COLOR};">
      <th style="padding:10px 12px;text-align:left;color:#fff;font-size:10px;font-weight:700;width:40px;">#</th>
      <th style="padding:10px 12px;text-align:left;color:#fff;font-size:10px;font-weight:700;">Descripción</th>
      <th style="padding:10px 12px;text-align:center;color:#fff;font-size:10px;font-weight:700;width:70px;">Cant.</th>
      <th style="padding:10px 12px;text-align:right;color:#fff;font-size:10px;font-weight:700;width:110px;">Precio Unit.</th>
      <th style="padding:10px 12px;text-align:center;color:#fff;font-size:10px;font-weight:700;width:65px;">ITBIS</th>
      <th style="padding:10px 12px;text-align:right;color:#fff;font-size:10px;font-weight:700;width:120px;">Total</th>
    </tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
</table>

<!-- TOTALES -->
<div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
  <div style="width:260px;">
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:12px;color:${GRAY};">
      <span>Subtotal:</span><span style="font-weight:600;color:${DARK};">${money(compra.subtotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:12px;color:${GRAY};">
      <span>ITBIS (18%):</span><span style="font-weight:600;color:${DARK};">${money(compra.itbis)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:10px 12px;background:${COLOR};border-radius:6px;margin-top:6px;">
      <span style="font-size:14px;font-weight:800;color:#fff;">TOTAL:</span>
      <span style="font-size:18px;font-weight:900;color:#fff;">${money(compra.total)}</span>
    </div>
  </div>
</div>

<!-- FIRMA -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px;padding-top:16px;border-top:1px solid #e5e7eb;">
  <div>
    <div style="border-top:1px solid #374151;padding-top:6px;margin-top:32px;">
      <div style="font-size:11px;font-weight:600;color:${DARK};">Autorizado por</div>
      <div style="font-size:10px;color:${GRAY};">${esc(empresa?.nombreComercial ?? empresa?.nombre)}</div>
    </div>
  </div>
  <div>
    <div style="border-top:1px solid #374151;padding-top:6px;margin-top:32px;">
      <div style="font-size:11px;font-weight:600;color:${DARK};">Aceptado por el Proveedor</div>
      <div style="font-size:10px;color:${GRAY};">${esc((compra as any).proveedor?.nombre)}</div>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div style="margin-top:16px;padding-top:8px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:${GRAY};">
  <span>Generado: ${new Date().toLocaleString('es-DO')}</span>
  <span style="color:${COLOR};font-weight:700;">HiCloud ERP · ${esc(empresa?.nombre)}</span>
</div>

</body>
</html>`;

    const puppeteer = await import('puppeteer');
    const browser   = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
      const buf = await page.pdf({ format: 'Letter', printBackground: true });
      this.logger.log(`PDF Orden de Compra generado: ${compra.folio}`);
      return { buffer: Buffer.from(buf), filename: `${compra.folio}.pdf` };
    } finally {
      await browser.close();
    }
  }
}
