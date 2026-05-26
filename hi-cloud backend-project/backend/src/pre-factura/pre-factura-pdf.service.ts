import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PreFactura } from './entities/pre-factura.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocumentoPDFData, DocumentoPDFItem } from '../common/pdf/documento-pdf.helper';
import { generarDocumentoPDFFactura } from '../common/pdf/documento-pdf.helper';

const ESTADO_COLOR: Record<string, string> = {
  borrador:   'orange',
  enviada:    'blue',
  aprobada:   'green',
  rechazada:  'red',
  convertida: 'green',
  vencida:    'red',
};

@Injectable()
export class PreFacturaPDFService {
  private readonly logger = new Logger(PreFacturaPDFService.name);

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

    // Descargar logo de la empresa
    let logoBuf: Buffer | undefined;
    if (empresa.logo) {
      try {
        const res = await fetch(empresa.logo, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) logoBuf = Buffer.from(await res.arrayBuffer());
      } catch (e: any) {
        this.logger.warn(`Logo no descargado (${empresa.logo}): ${e?.message}`);
      }
    }

    // Construir ítems con cálculo de subtotales gravado/exento
    const items: DocumentoPDFItem[] = ((pf as any).detalles ?? []).map((d: any) => {
      const itbisPct    = Number(d.porcentajeIva ?? 18);
      const subtotal    = Number(d.precioUnitario) * Number(d.cantidad);
      const importeItbis = Number(d.iva ?? d.importeIva ?? subtotal * (itbisPct / 100));
      return {
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        unidadMedida:   d.unidadMedida ?? 'UN',
        precioUnitario: Number(d.precioUnitario),
        itbisPct,
        importeItbis,
        subtotal,
        total:          Number(d.total ?? subtotal + importeItbis),
      };
    });

    const subtotalGravado = items.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0);
    const subtotalExento  = items.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0);

    const factConf = (empresa.configuracion ?? {}) as Record<string, unknown>;

    // Subtítulo que incluye tipo NCF si existe
    const tipoSub = pf.tipoNcf
      ? `Pre-Factura · Tipo NCF: ${pf.tipoNcf} · No válida como comprobante fiscal`
      : 'Cotización formal · No válida como comprobante fiscal';

    const data: DocumentoPDFData = {
      tipo:             'PRE-FACTURA',
      tipoSub,
      numero:           pf.folio,
      fecha:            String(pf.fecha),
      fechaVencimiento: pf.fechaVencimiento ? String(pf.fechaVencimiento) : undefined,
      estado:           pf.estado,
      estadoColor:      ESTADO_COLOR[pf.estado] ?? 'blue',
      empresaNombre:    empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:       empresa.rnc || '',
      empresaDireccion: empresa.direccion || '',
      empresaCiudad:    empresa.ciudad,
      empresaTelefono:  factConf.factMostrarTelefono !== false ? empresa.telefono : undefined,
      empresaEmail:     factConf.factMostrarEmail    !== false ? empresa.email    : undefined,
      empresaSitioWeb:  factConf.factMostrarWeb      !== false ? empresa.sitioWeb : undefined,
      empresaPie:       empresa.configuracion?.pieFactura as string | undefined,
      vendedorNombre:   pf.nombreVendedor,
      clienteNombre:    (pf as any).cliente?.nombre || 'Consumidor Final',
      clienteRNC:       (pf as any).cliente?.rncReceptor || (pf as any).cliente?.rfc,
      clienteDireccion: (pf as any).cliente?.direccion,
      clienteCiudad:    (pf as any).cliente?.ciudad,
      clienteTelefono:  (pf as any).cliente?.telefono,
      clienteEmail:     (pf as any).cliente?.email,
      items,
      subtotalGravado,
      subtotalExento,
      subtotalGeneral:  subtotalGravado + subtotalExento,
      itbisTotal:       Number(pf.iva ?? 0),
      totalGeneral:     Number(pf.total ?? 0),
      notas:            pf.notas ?? undefined,
      mostrarFirma:     false,  // Pre-factura no tiene sección de firma
    };

    const buffer = await generarDocumentoPDFFactura(data, logoBuf);
    return { buffer, filename: `${pf.folio}.pdf` };
  }
}
