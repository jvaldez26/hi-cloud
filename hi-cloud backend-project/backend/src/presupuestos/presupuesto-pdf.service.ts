import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as https from 'https';
import * as http  from 'http';
import { Presupuesto } from './entities/presupuesto.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarDocumento } from '../common/doc.template';
import type { DocData } from '../common/doc.template';

const TIPO_LABEL: Record<string, string> = {
  ventas: 'Ventas', compras: 'Compras', gastos: 'Gastos', caja: 'Caja', general: 'General',
};
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Injectable()
export class PresupuestoPDFService {
  constructor(
    @InjectRepository(Presupuesto) private repo: Repository<Presupuesto>,
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
    const pres = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['lineas'],
    });
    if (!pres) throw new NotFoundException(`Presupuesto #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const logo   = await this.resolverLogo(empresa.logo ?? '');
    const numero = `PRES-${pres.id.toString().padStart(4, '0')}`;
    const lineas = ((pres as any).lineas ?? []).sort((a: any, b: any) => a.mes - b.mes);

    const data: DocData = {
      tipo:        'PRESUPUESTO',
      tipoSub:     `${TIPO_LABEL[pres.tipo] ?? pres.tipo} · Año ${pres.anio}`,
      numero,
      fecha:       `${pres.anio}-01-01`,
      estado:      pres.estado,
      estadoColor: pres.estado === 'aprobado' ? 'green' : pres.estado === 'cerrado' ? 'red' : 'orange',
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
      campos: [
        { label: 'Nombre', valor: pres.nombre },
        { label: 'Tipo', valor: TIPO_LABEL[pres.tipo] ?? pres.tipo },
        { label: 'Año', valor: pres.anio },
      ],
      items: lineas.map((l: any) => ({
        descripcion: `${MESES[(l.mes ?? 1) - 1] ?? l.mes} · ${l.categoria || 'General'}`,
        nota:        l.cuentaCodigo ? `Cuenta: ${l.cuentaCodigo}` : undefined,
        importe:     Number(l.montoPresupuestado),
      })),
      totales: [
        { label: 'Total Presupuestado', valor: Number(pres.totalPresupuestado), bold: true },
      ],
      notas: pres.descripcion ?? undefined,
      pie: `Presupuesto ${TIPO_LABEL[pres.tipo] ?? pres.tipo} para el año ${pres.anio}. HiCloud ERP · República Dominicana`,
    };

    const buffer = await this.htmlToPDF(generarDocumento(data));
    return { buffer, filename: `presupuesto-${numero}.pdf` };
  }
}
