import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import * as https           from 'https';
import * as http            from 'http';
import { NotaCredito }      from './entities/nota-credito.entity';
import { TenantService }    from '../tenant/tenant.service';
import { generarHTMLNota } from '../notas-debito/nota.template';
import type { NotaPDFData } from '../notas-debito/nota.template';

@Injectable()
export class NotaCreditoPDFService {
  constructor(
    @InjectRepository(NotaCredito) private repo: Repository<NotaCredito>,
    private tenantSvc: TenantService,
  ) {}

  private async htmlToPDF(html: string): Promise<Buffer> {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4', printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private async resolverLogo(url: string): Promise<string> {
    if (!url || !url.startsWith('http')) return '';
    if (url.startsWith('data:')) return url;
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

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();

    const nc = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!nc) throw new NotFoundException(`Nota de Crédito #${id} no encontrada`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const ecf = await this.repo.manager
      .query(
        `SELECT numero, "estadoDGII" FROM ecf
         WHERE "documentoOrigenId" = $1
           AND "documentoOrigenTipo" = 'NOTA_CREDITO'
           AND "isActive" = true
         ORDER BY "createdAt" DESC LIMIT 1`,
        [id],
      )
      .then((r: any[]) => r[0] || null);

    const logoSrc = await this.resolverLogo(empresa.logo ?? '');

    const data: NotaPDFData = {
      tipo:                 'CREDITO',
      numero:               nc.numero,
      fecha:                String(nc.fecha),
      tipoNcf:              nc.tipoNcf ?? 'E34',
      ecfNumero:            ecf?.numero,
      ecfEstado:            ecf?.estadoDGII,
      empresaNombre:        empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:           empresa.rnc || '',
      empresaDireccion:     empresa.direccion || '',
      empresaCiudad:        empresa.ciudad,
      empresaTelefono:      empresa.telefono,
      empresaEmail:         empresa.email,
      empresaLogo:          logoSrc,
      empresaColor:         (empresa.configuracion as any)?.colorPrimario ?? '#1a56db',
      clienteNombre:        nc.cliente?.nombre || 'Consumidor Final',
      clienteRNC:           nc.cliente?.rncReceptor || nc.cliente?.rfc,
      clienteDireccion:     nc.cliente?.direccion,
      clienteTelefono:      nc.cliente?.telefono,
      clienteEmail:         nc.cliente?.email,
      facturaOriginalFolio: nc.facturaOriginalFolio,
      descripcionMotivo:    nc.descripcionMotivo,
      notas:                nc.notas,
      items: (nc.detalles ?? []).map(det => ({
        descripcion:    det.descripcion,
        cantidad:       Number(det.cantidad),
        precioUnitario: Number(det.precioUnitario),
        porcentajeIva:  Number(det.porcentajeIva ?? 18),
        importeIva:     Number(det.iva ?? 0),
        total:          Number(det.total ?? 0),
      })),
      subtotal: Number(nc.subtotal ?? 0),
      iva:      Number(nc.iva ?? 0),
      total:    Number(nc.total ?? 0),
      estado:   nc.estado,
    };

    const html   = generarHTMLNota(data);
    const buffer = await this.htmlToPDF(html);
    return { buffer, filename: `${nc.numero}.pdf` };
  }
}
