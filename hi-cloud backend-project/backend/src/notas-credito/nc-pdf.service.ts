import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import * as qrcode          from 'qrcode';
import { NotaCredito }      from './entities/nota-credito.entity';
import { TenantService }    from '../tenant/tenant.service';
import { BrowserService }   from '../common/services/browser.service';
import { generarHTMLNota }  from '../notas-debito/nota.template';
import type { NotaPDFData } from '../notas-debito/nota.template';

const CODIGO_MOD_LABEL: Record<string, string> = {
  '1': '1 — Anulación total',
  '2': '2 — Corrección de texto',
  '3': '3 — Devolución / Ajuste de montos',
  '4': '4 — Reemplazo por contingencia',
  '5': '5 — Referencia a Factura de Consumo',
};

@Injectable()
export class NotaCreditoPDFService {
  private readonly logger = new Logger(NotaCreditoPDFService.name);

  constructor(
    @InjectRepository(NotaCredito) private repo: Repository<NotaCredito>,
    private tenantSvc:  TenantService,
    private browserSvc: BrowserService,
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

    // ECF de esta nota (para e-NCF, QR, código de seguridad)
    const ecf = await this.repo.manager.query(
      `SELECT numero, "estadoDGII", "codigoSeguridad", "qrUrl", "fechaFirma",
              "ncfModificado", "codigoModificacion", "respuestaMSeller"
       FROM ecf
       WHERE "documentoOrigenId"   = $1
         AND "documentoOrigenTipo" = 'NOTA_CREDITO'
         AND "isActive"            = true
       ORDER BY "createdAt" DESC LIMIT 1`,
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
        .catch(err => { this.logger.warn(`[NC-PDF] QR error: ${err.message}`); return ''; });
    }

    const logoDataUrl = empresa.logo
      ? await fetch(empresa.logo, { signal: AbortSignal.timeout(5_000) })
          .then(async r => r.ok ? `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : undefined)
          .catch(() => undefined)
      : undefined;

    const data: NotaPDFData = {
      tipo:                 'CREDITO',
      numero:               nc.numero,
      fecha:                String(nc.fecha),
      tipoNcf:              nc.tipoNcf ?? 'E34',
      ecfNumero:            ecf?.numero,
      ecfEstado:            ecf?.estadoDGII,
      ecfCodigoSeguridad:   ecf?.codigoSeguridad,
      ecfFechaFirma:        ecfSignedDateISO(ecf),
      qrBase64,
      empresaNombre:        empresa.nombreComercial || empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:           empresa.rnc || '',
      empresaDireccion:     empresa.direccion || '',
      empresaCiudad:        empresa.ciudad,
      empresaTelefono:      empresa.telefono,
      empresaEmail:         empresa.email,
      empresaLogo:          logoDataUrl,
      empresaColor:         (empresa.configuracion as any)?.colorPrimario ?? '#1a56db',
      clienteNombre:        nc.cliente?.nombre || 'Consumidor Final',
      clienteRNC:           nc.cliente?.rncReceptor || nc.cliente?.rfc,
      facturaOriginalFolio: nc.facturaOriginalFolio,
      ncfOriginal:          ecf?.ncfModificado,
      codigoModificacion:   ecf?.codigoModificacion
        ? CODIGO_MOD_LABEL[String(ecf.codigoModificacion)] ?? `Código ${ecf.codigoModificacion}`
        : undefined,
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
    const buffer = await this.browserSvc.htmlToPDF(html);
    return { buffer, filename: `${nc.numero}.pdf` };
  }
}

// Devuelve ISO string para fmtDT: prioriza fechaFirma de BD, fallback a signedDate MSeller (UTC-4 RD)
function ecfSignedDateISO(ecf: any): string | undefined {
  if (ecf?.fechaFirma) return String(ecf.fechaFirma);
  const sd: string | undefined = ecf?.respuestaMSeller?.signedDate;
  if (!sd) return undefined;
  const m = sd.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`).toISOString() : undefined;
}
