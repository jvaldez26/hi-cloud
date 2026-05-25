import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { NotaCredito }      from './entities/nota-credito.entity';
import { TenantService }    from '../tenant/tenant.service';
import { generarNotaPDF }   from '../common/pdf/nota-pdf.helper';
import type { NotaPDFData } from '../common/pdf/nota-pdf.helper';

@Injectable()
export class NotaCreditoPDFService {
  constructor(
    @InjectRepository(NotaCredito) private repo: Repository<NotaCredito>,
    private tenantSvc: TenantService,
  ) {}

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

    const buffer = await generarNotaPDF(data);
    return { buffer, filename: `${nc.numero}.pdf` };
  }
}
