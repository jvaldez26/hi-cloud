import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import * as qrcode          from 'qrcode';
import { NotaDebito }       from './entities/nota-debito.entity';
import { TenantService }    from '../tenant/tenant.service';
import { generarNotaPDF }   from '../common/pdf/nota-pdf.helper';
import type { NotaPDFData } from '../common/pdf/nota-pdf.helper';

const MOTIVO_LABEL: Record<string, string> = {
  cargo_adicional:   'Cargo adicional',
  ajuste_precio:     'Ajuste de precio',
  intereses:         'Intereses por mora',
  flete_adicional:   'Flete / Transporte adicional',
  diferencia_cambio: 'Diferencia de cambio',
  otro:              'Otros cargos adicionales',
};

@Injectable()
export class NotaDebitoPDFService {
  private readonly logger = new Logger(NotaDebitoPDFService.name);

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

    // ECF de esta nota — incluye QR, código seguridad, NCF modificado, fecha venc. secuencia
    const ecf = await this.repo.manager.query(
      `SELECT e.numero, e."estadoDGII", e."codigoSeguridad", e."qrUrl", e."fechaFirma",
              e."ncfModificado", e."codigoModificacion", e."respuestaMSeller",
              s."fechaVencimiento" AS "secFechaVenc"
       FROM ecf e
       LEFT JOIN secuencias_ecf s ON s.id = e."secuenciaId"
       WHERE e."documentoOrigenId"   = $1
         AND e."documentoOrigenTipo" = 'NOTA_DEBITO'
         AND e."isActive"            = true
       ORDER BY e."createdAt" DESC LIMIT 1`,
      [id],
    ).then((r: any[]) => r[0] || null);

    // Generar QR DGII
    let qrBase64 = '';
    if (ecf?.numero && empresa.rnc) {
      const urlQR = ecf.qrUrl
        ?? `https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${empresa.rnc}` +
           `&eNCF=${ecf.numero}` +
           (ecf.codigoSeguridad ? `&CodigoSeguridadNCF=${ecf.codigoSeguridad}` : '');
      qrBase64 = await qrcode.toDataURL(urlQR, {
        width: 180, margin: 1, color: { dark: '#000000', light: '#ffffff' },
      })
        .then(url => url.replace('data:image/png;base64,', ''))
        .catch(err => { this.logger.warn(`[ND-PDF] QR error: ${err.message}`); return ''; });
    }

    // Fecha de vencimiento de la secuencia (E33 SÍ tiene FechaVencimientoSecuencia)
    const fechaVencSecuencia = ecf?.secFechaVenc
      ? new Date(ecf.secFechaVenc).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : undefined;

    const motivoLabel = nd.motivo ? (MOTIVO_LABEL[nd.motivo] ?? nd.motivo) : undefined;

    const data: NotaPDFData = {
      tipo:                 'DEBITO',
      numero:               nd.numero,
      fecha:                String(nd.fecha),
      tipoNcf:              nd.tipoNcf ?? 'E33',
      ecfNumero:            ecf?.numero,
      ecfEstado:            ecf?.estadoDGII,
      ecfCodigoSeguridad:   ecf?.codigoSeguridad,
      ecfFechaFirma:        ecfSignedDateISO(ecf),
      qrBase64,
      fechaVencSecuencia,
      empresaNombre:        empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
      empresaRNC:           empresa.rnc || '',
      empresaDireccion:     empresa.direccion || '',
      empresaCiudad:        empresa.ciudad,
      empresaTelefono:      empresa.telefono,
      empresaEmail:         empresa.email,
      empresaColor:         (empresa.configuracion as any)?.colorPrimario ?? '#d97706',
      clienteNombre:        nd.cliente?.nombre || 'Consumidor Final',
      clienteRNC:           nd.cliente?.rncReceptor || nd.cliente?.rfc,
      facturaOriginalFolio: nd.facturaOriginalFolio,
      ncfOriginal:          ecf?.ncfModificado,
      codigoModificacion:   'Código 3 — Corrección de montos',
      motivoConcepto:       motivoLabel,
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

function ecfSignedDateISO(ecf: any): string | undefined {
  if (ecf?.fechaFirma) return String(ecf.fechaFirma);
  const sd: string | undefined = ecf?.respuestaMSeller?.signedDate;
  if (!sd) return undefined;
  const m = sd.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`).toISOString() : undefined;
}
