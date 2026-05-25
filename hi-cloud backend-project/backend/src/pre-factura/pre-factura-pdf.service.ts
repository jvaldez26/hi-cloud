import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PreFactura } from './entities/pre-factura.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocData, DocTotal, DocCampo } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';

const ESTADO_COLOR: Record<string, string> = {
  borrador: 'orange', enviada: 'blue', aprobada: 'green',
  rechazada: 'red', convertida: 'green', vencida: 'red',
};

@Injectable()
export class PreFacturaPDFService {
  constructor(
    @InjectRepository(PreFactura) private repo: Repository<PreFactura>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!pf) throw new NotFoundException(`Pre-Factura #${id} no encontrada`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const subtotal = Number(pf.subtotal ?? 0);
    const iva      = Number(pf.iva      ?? 0);
    const total    = Number(pf.total    ?? 0);

    const totales: DocTotal[] = [
      { label: 'Subtotal',    valor: subtotal },
      { label: 'ITBIS (18%)', valor: iva },
      { label: 'Total',       valor: total, bold: true },
    ];

    const campos: DocCampo[] = [];
    if (pf.tipoNcf)           campos.push({ label: 'Tipo NCF',     valor: pf.tipoNcf,               mono: true });
    if (pf.fechaVencimiento)  campos.push({ label: 'Válida hasta', valor: String(pf.fechaVencimiento) });
    if (pf.nombreVendedor)    campos.push({ label: 'Vendedor',     valor: pf.nombreVendedor });

    const data: DocData = {
      tipo:        'PRE-FACTURA',
      tipoSub:     'Cotización formal · No válida como comprobante fiscal',
      numero:      pf.folio,
      fecha:       String(pf.fecha),
      estado:      pf.estado,
      estadoColor: ESTADO_COLOR[pf.estado] ?? 'blue',
      empresa: {
        nombre:    empresa.razonSocial || empresa.nombre || 'Mi Empresa',
        rnc:       empresa.rnc || '',
        direccion: empresa.direccion || '',
        ciudad:    empresa.ciudad,
        telefono:  empresa.telefono,
        email:     empresa.email,
      },
      participante: {
        label:  'Cliente',
        nombre: (pf as any).cliente?.nombre || 'Consumidor Final',
        rnc:    (pf as any).cliente?.rncReceptor,
        dir:    (pf as any).cliente?.direccion,
        tel:    (pf as any).cliente?.telefono,
        email:  (pf as any).cliente?.email,
      },
      campos,
      items: ((pf as any).detalles ?? []).map((d: any) => ({
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        unidad:         d.unidadMedida,
        precioUnitario: Number(d.precioUnitario),
        importe:        Number(d.total ?? 0),
      })),
      totales,
      notas: pf.notas ?? undefined,
      pie: 'Esta pre-factura es una cotización formal y no constituye un comprobante fiscal. Sujeta a aprobación. HiCloud ERP · República Dominicana',
    };

    const buffer = await generarDocumentoPDF(data);
    return { buffer, filename: `${pf.folio}.pdf` };
  }
}
