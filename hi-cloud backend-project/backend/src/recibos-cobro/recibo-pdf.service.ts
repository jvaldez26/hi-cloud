import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as https from 'https';
import * as http  from 'http';
import { ReciboCobro } from './entities/recibo-cobro.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarDocumento } from '../common/doc.template';
import type { DocData } from '../common/doc.template';

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia Bancaria',
  cheque: 'Cheque', tarjeta: 'Tarjeta de Crédito/Débito',
  deposito: 'Depósito Bancario', otro: 'Otro',
};

@Injectable()
export class ReciboPDFService {
  constructor(
    @InjectRepository(ReciboCobro) private repo: Repository<ReciboCobro>,
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
    const rec = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!rec) throw new NotFoundException(`Recibo #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const logo = await this.resolverLogo(empresa.logo ?? '');

    const data: DocData = {
      tipo:    'RECIBO DE COBRO',
      tipoSub: 'Comprobante de pago al cliente',
      numero:  rec.numero,
      fecha:   String(rec.fecha),
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
      participante: {
        label:  'Cliente',
        nombre: rec.clienteNombre || 'Consumidor Final',
      },
      campos: [
        { label: 'Método de Pago', valor: METODO_LABEL[rec.metodoPago as string] ?? (rec.metodoPago as string) },
        ...(rec.facturaFolio ? [{ label: 'Factura Aplicada', valor: rec.facturaFolio, mono: true }] : []),
        ...(rec.referencia   ? [{ label: 'Referencia', valor: rec.referencia }] : []),
        ...(rec.nombreUsuario ? [{ label: 'Atendido por', valor: rec.nombreUsuario }] : []),
      ],
      items: [{ descripcion: rec.concepto, importe: Number(rec.monto) }],
      totales: [{ label: 'Total Recibido', valor: Number(rec.monto), bold: true }],
      notas: rec.notas ?? undefined,
      pie: 'Este recibo de cobro certifica que el cliente realizó el pago indicado. Consérvelo como comprobante. HiCloud ERP · República Dominicana',
    };

    const buffer = await this.htmlToPDF(generarDocumento(data));
    return { buffer, filename: `${rec.numero}.pdf` };
  }
}
