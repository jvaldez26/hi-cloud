import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as https from 'https';
import * as http  from 'http';
import { Gasto } from './entities/gasto.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarDocumento } from '../common/doc.template';
import type { DocData } from '../common/doc.template';

const CATEGORIA_LABEL: Record<string, string> = {
  alquiler: 'Alquiler', servicios_publicos: 'Servicios Públicos', comunicaciones: 'Comunicaciones',
  nomina: 'Nómina', materiales_oficina: 'Materiales de Oficina', transporte: 'Transporte',
  marketing: 'Marketing / Publicidad', impuestos_tasas: 'Impuestos y Tasas', mantenimiento: 'Mantenimiento',
  seguros: 'Seguros', gastos_financieros: 'Gastos Financieros', gasto_menor: 'Gasto Menor', otros: 'Otros',
};

@Injectable()
export class GastoPDFService {
  constructor(
    @InjectRepository(Gasto) private repo: Repository<Gasto>,
    private tenantSvc: TenantService,
  ) {}

  private async htmlToPDF(html: string): Promise<Buffer> {
    const puppeteer = await import('puppeteer');
    const browser   = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top:'0',bottom:'0',left:'0',right:'0' } });
      return Buffer.from(pdf);
    } finally { await browser.close(); }
  }

  private async resolverLogo(url: string): Promise<string> {
    if (!url || !url.startsWith('http')) return '';
    return new Promise(resolve => {
      const lib = url.startsWith('https') ? https : http;
      lib.get(url, res => {
        const ct = res.headers['content-type'] ?? 'image/jpeg'; const ch: Buffer[] = [];
        res.on('data', (c: Buffer) => ch.push(c));
        res.on('end',  () => resolve(`data:${ct};base64,${Buffer.concat(ch).toString('base64')}`));
        res.on('error', () => resolve(''));
      }).on('error', () => resolve(''));
    });
  }

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const g = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!g) throw new NotFoundException(`Gasto #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const logo = await this.resolverLogo(empresa.logo ?? '');
    const numero = `GAS-${g.id.toString().padStart(6, '0')}`;

    const campos: any[] = [
      { label: 'Categoría', valor: CATEGORIA_LABEL[g.categoria as string] ?? (g.categoria as string) },
      { label: 'Período', valor: g.periodo },
    ];
    if (g.proveedor)    campos.push({ label: 'Proveedor', valor: g.proveedor });
    if (g.rncProveedor) campos.push({ label: 'RNC Proveedor', valor: g.rncProveedor, mono: true });
    if (g.comprobante)  campos.push({ label: 'Comprobante', valor: g.comprobante, mono: true });

    const data: DocData = {
      tipo:    'COMPROBANTE DE GASTO',
      tipoSub: 'Registro de gasto operacional',
      numero,
      fecha:   String(g.fecha),
      empresa: {
        nombre:    empresa.razonSocial || empresa.nombre || 'Mi Empresa',
        rnc:       empresa.rnc || '',
        direccion: empresa.direccion || '',
        ciudad:    empresa.ciudad,
        telefono:  empresa.telefono,
        email:     empresa.email,
        logo,
        color:     (empresa.configuracion as any)?.colorPrimario,
      },
      campos,
      items: [
        { descripcion: g.descripcion, importe: Number(g.monto) },
        ...(Number(g.itbis ?? 0) > 0 ? [{ descripcion: 'ITBIS', importe: Number(g.itbis) }] : []),
      ],
      totales: [
        { label: 'Subtotal', valor: Number(g.monto) },
        ...(Number(g.itbis ?? 0) > 0 ? [{ label: 'ITBIS', valor: Number(g.itbis) }] : []),
        { label: 'Total', valor: Number(g.total), bold: true },
      ],
      pie: 'Este comprobante de gasto es para uso interno contable. HiCloud ERP · República Dominicana',
    };

    const buffer = await this.htmlToPDF(generarDocumento(data));
    return { buffer, filename: `gasto-${numero}.pdf` };
  }
}
