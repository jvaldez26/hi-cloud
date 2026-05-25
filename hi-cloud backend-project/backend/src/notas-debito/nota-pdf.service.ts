import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { NotaDebito }       from './entities/nota-debito.entity';
import { TenantService }    from '../tenant/tenant.service';
import { generarNotaPDF }   from '../common/pdf/nota-pdf.helper';
import type { NotaPDFData } from '../common/pdf/nota-pdf.helper';

@Injectable()
export class NotaDebitoPDFService {
  constructor(
    @InjectRepository(NotaDebito) private repo: Repository<NotaDebito>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();

    const nd = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!nd) throw new NotFoundException(`Nota de Débito #${id} no encontrada`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const ecf = await this.repo.manager
      .query(
        `SELECT numero, "estadoDGII" FROM ecf
         WHERE "documentoOrigenId" = $1
           AND "documentoOrigenTipo" = 'NOTA_DEBITO'
           AND "isActive" = true
         ORDER BY "createdAt" DESC LIMIT 1`,
        [id],
      )
      .then((r: any[]) => r[0] || null);

    const data: NotaPDFData = {
      tipo:                 'DEBITO',
      numero:               nd.numero,
      fecha:                String(nd.fecha),
      tipoNcf:              nd.tipoNcf ?? 'E33',
      ecfNumero:            ecf?.numero,
      ecfEstado:            ecf?.estadoDGII,
      empresaNombre:        empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:           empresa.rnc || '',
      empresaDireccion:     empresa.direccion || '',
      empresaCiudad:        empresa.ciudad,
      empresaTelefono:      empresa.telefono,
      empresaEmail:         empresa.email,
      empresaColor:         (empresa.configuracion as any)?.colorPrimario ?? '#d97706',
      clienteNombre:        nd.cliente?.nombre || 'Consumidor Final',
      clienteRNC:           nd.cliente?.rncReceptor || nd.cliente?.rfc,
      clienteDireccion:     nd.cliente?.direccion,
      clienteTelefono:      nd.cliente?.telefono,
      clienteEmail:         nd.cliente?.email,
      facturaOriginalFolio: nd.facturaOriginalFolio,
      descripcionMotivo:    nd.descripcionMotivo,
      notas:                nd.notas,
      items: (nd.detalles ?? []).map(det => ({
        descripcion:    det.descripcion,
        cantidad:       Number(det.cantidad),
        precioUnitario: Number(det.precioUnitario),
        porcentajeIva:  Number(det.porcentajeIva ?? 18),
        importeIva:     Number(det.iva ?? 0),
        total:          Number(det.total ?? 0),
      })),
      subtotal: Number(nd.subtotal ?? 0),
      iva:      Number(nd.iva ?? 0),
      total:    Number(nd.total ?? 0),
      estado:   nd.estado,
    };

    const buffer = await generarNotaPDF(data);
    return { buffer, filename: `${nd.numero}.pdf` };
  }
}
