import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Compra } from './entities/compra.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocData } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';

const ESTADO_COLOR: Record<string, string> = {
  recibida: 'green', pagada: 'blue', pendiente: 'orange', anulada: 'red',
};

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
    const proveedor = (compra as any).proveedor ?? {};

    const data: DocData = {
      tipo:        'ORDEN DE COMPRA',
      numero:      compra.folio,
      fecha:       String(compra.fecha),
      estado:      compra.estado ?? 'pendiente',
      estadoColor: ESTADO_COLOR[(compra.estado ?? 'pendiente').toLowerCase()] ?? 'orange',
      empresa: {
        nombre:    empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
        rnc:       empresa?.rnc ?? '',
        direccion: empresa?.direccion ?? '',
        ciudad:    empresa?.ciudad,
        telefono:  empresa?.telefono,
        email:     empresa?.email,
      },
      participante: {
        label:  'Proveedor',
        nombre: proveedor.nombre || '—',
        rnc:    proveedor.rnc,
        tel:    proveedor.telefono,
        email:  proveedor.email,
      },
      campos: [
        ...((compra as any).usuario?.nombre
          ? [{ label: 'Elaborado por', valor: (compra as any).usuario.nombre }]
          : []),
      ],
      items: (compra.detalles ?? []).map((d: any) => {
        const sub  = Number(d.precioUnitario) * Number(d.cantidad);
        const itbs = sub * (Number(d.porcentajeItbis ?? 18) / 100);
        return {
          descripcion:    d.descripcion,
          cantidad:       Number(d.cantidad),
          precioUnitario: Number(d.precioUnitario),
          importe:        sub + itbs,
        };
      }),
      totales: [
        { label: 'Subtotal',    valor: Number(compra.subtotal) },
        { label: 'ITBIS (18%)', valor: Number(compra.itbis) },
        { label: 'Total Orden', valor: Number(compra.total), bold: true },
      ],
      notas: compra.notas ?? undefined,
      pie: '¡Gracias por su preferencia! HiCloud ERP · República Dominicana',
    };

    const buffer = await generarDocumentoPDF(data);
    this.logger.log(`PDF Orden de Compra generado: ${compra.folio}`);
    return { buffer, filename: `${compra.folio}.pdf` };
  }
}
