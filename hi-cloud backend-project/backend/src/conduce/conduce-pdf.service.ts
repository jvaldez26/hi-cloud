import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as https from 'https';
import * as http  from 'http';
import { Conduce } from './entities/conduce.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarDocumento } from '../common/doc.template';
import type { DocData } from '../common/doc.template';
import { BrowserService } from '../common/services/browser.service';

const ESTADO_COLOR: Record<string, string> = {
  generado: 'orange', en_transito: 'blue', entregado: 'green', devuelto: 'red',
};
const ESTADO_LABEL: Record<string, string> = {
  generado: 'Generado', en_transito: 'En Tránsito', entregado: 'Entregado', devuelto: 'Devuelto',
};

@Injectable()
export class ConducePDFService {
  constructor(
    @InjectRepository(Conduce) private repo: Repository<Conduce>,
    private tenantSvc: TenantService,
    private browserSvc: BrowserService,
  ) {}

  private async htmlToPDF(html: string): Promise<Buffer> {
    return this.browserSvc.htmlToPDF(html);
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
    const cond = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!cond) throw new NotFoundException(`Conduce #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const logo = await this.resolverLogo(empresa.logo ?? '');

    const campos: any[] = [
      { label: 'Dirección de Entrega', valor: cond.direccionEntrega + (cond.ciudad ? ', ' + cond.ciudad : '') },
    ];
    if (cond.fechaEntregaProgramada) campos.push({ label: 'Entrega Programada', valor: String(cond.fechaEntregaProgramada) });
    if (cond.contactoEntrega)        campos.push({ label: 'Contacto', valor: cond.contactoEntrega + (cond.telefonoContacto ? ' · ' + cond.telefonoContacto : '') });
    if (cond.conductor)              campos.push({ label: 'Conductor', valor: cond.conductor });
    if (cond.vehiculo)               campos.push({ label: 'Vehículo', valor: cond.vehiculo });

    const data: DocData = {
      tipo:        'CONDUCE',
      tipoSub:     'Nota de entrega / Remisión de mercancía',
      numero:      cond.numero,
      fecha:       String(cond.fecha),
      estado:      ESTADO_LABEL[cond.estado] ?? cond.estado,
      estadoColor: ESTADO_COLOR[cond.estado] ?? 'blue',
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
        label:  'Destinatario / Cliente',
        nombre: (cond as any).cliente?.nombre || 'Sin cliente',
        rnc:    (cond as any).cliente?.rncReceptor,
        dir:    (cond as any).cliente?.direccion,
        tel:    (cond as any).cliente?.telefono,
        email:  (cond as any).cliente?.email,
      },
      campos,
      items: ((cond as any).detalles ?? []).map((d: any) => ({
        descripcion: d.descripcion,
        cantidad:    Number(d.cantidad),
        unidad:      d.unidadMedida,
        importe:     0,
        nota: d.cantidadDevuelta > 0 ? `Devuelta: ${d.cantidadDevuelta}` : (d.observaciones ?? undefined),
      })),
      notas: cond.notas ?? undefined,
      pie: 'Este conduce certifica la entrega de la mercancía descrita. Firma del receptor como conformidad. HiCloud ERP · República Dominicana',
    };

    const buffer = await this.htmlToPDF(generarDocumento(data));
    return { buffer, filename: `${cond.numero}.pdf` };
  }
}
