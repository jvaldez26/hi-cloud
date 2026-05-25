import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as qrcode from 'qrcode';
import { Factura } from '../entities/factura.entity';
import { TenantService } from '../../tenant/tenant.service';
import { NumeroLetrasService } from './numero-letras.service';
import { BrowserService } from '../../common/services/browser.service';
import { generarHTMLFactura } from '../templates/factura.template';
import type { FacturaPDFData, FacturaPDFItem } from '../templates/factura.template';
import type { ReciboPOSData } from '../templates/recibo-termico.template';
import { generarReciboPOSPDF } from '../../common/pdf/factura-pdf.helper';

@Injectable()
export class PDFService {
  private readonly logger = new Logger(PDFService.name);

  constructor(
    @InjectRepository(Factura)
    private facturaRepo: Repository<Factura>,
    private tenantSvc:   TenantService,
    private numLetras:   NumeroLetrasService,
    private browserSvc:  BrowserService,
  ) {}

  // ── Genera QR base64 ────────────────────────────────────────────────
  private async generarQR(texto: string): Promise<string> {
    try {
      const url = await qrcode.toDataURL(texto, {
        width: 180, margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
      return url.replace('data:image/png;base64,', '');
    } catch (e) {
      this.logger.warn('No se pudo generar QR: ' + e);
      return '';
    }
  }

  // ── Descarga logo → base64 data URI ─────────────────────────────────
  private async logoToBase64(logoUrl: string): Promise<string | undefined> {
    if (!logoUrl) return undefined;
    try {
      const res = await fetch(logoUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return undefined;
      const buf  = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') ?? 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e: any) {
      this.logger.warn(`Logo no descargado (${logoUrl}): ${e?.message}`);
      return undefined;
    }
  }

  // ── Construye FacturaPDFData desde la entidad ───────────────────────
  private async buildFacturaData(factura: Factura): Promise<FacturaPDFData> {
    const empresaId = this.tenantSvc.getEmpresaId();

    const empresa = await this.facturaRepo.manager.query(
      'SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    ).then((rows: any[]) => rows[0] || {});

    const ecf = factura.ecfId
      ? await this.facturaRepo.manager.query(
          `SELECT e.*, t.codigo, t.descripcion,
                  s."fechaVencimiento" AS "secFechaVencimiento"
             FROM ecf e
             JOIN tipos_ecf     t ON t.id = e."tipoECFId"
             JOIN secuencias_ecf s ON s.id = e."secuenciaId"
            WHERE e.id = $1 LIMIT 1`,
          [factura.ecfId],
        ).then((r: any[]) => r[0])
      : null;

    // ── QR del comprobante fiscal ────────────────────────────────────
    let qrBase64 = '';
    if (ecf?.numero && empresa.rnc) {
      const urlQR = ecf.qrUrl
        ?? `https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${empresa.rnc}&eNCF=${ecf.numero}` +
           (ecf.codigoSeguridad ? `&CodigoSeguridadNCF=${ecf.codigoSeguridad}` : '');
      qrBase64 = await this.generarQR(urlQR);
    }

    // ── Logo como base64 ─────────────────────────────────────────────
    const factConf = (empresa.configuracion ?? {}) as Record<string, unknown>;
    let empresaLogo: string | undefined;
    if (factConf.factMostrarLogo !== false && empresa.logo) {
      empresaLogo = await this.logoToBase64(empresa.logo);
    }

    // ── Ítems ────────────────────────────────────────────────────────
    const items: FacturaPDFItem[] = (factura.detalles || []).map((d, i) => {
      const itbisPct  = Number(d.porcentajeIva ?? 18);
      const subtotal  = Number(d.precioUnitario) * Number(d.cantidad);
      const impIva    = subtotal * (itbisPct / 100);
      return {
        numero:         i + 1,
        codigo:         (d as any).producto?.codigo,
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        unidadMedida:   (d as any).producto?.unidadMedida ?? 'UN',
        precioUnitario: Number(d.precioUnitario),
        descuentoPct:   0,
        subtotal,
        itbisPct,
        importeItbis:   impIva,
        total:          subtotal + impIva,
      };
    });

    // ── Totales ──────────────────────────────────────────────────────
    const subtotalGravado = items.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0);
    const subtotalExento  = items.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0);
    const subtotalGeneral = subtotalGravado + subtotalExento;
    const itbisTotal      = Number(factura.iva   ?? 0);
    const totalGeneral    = Number(factura.total  ?? 0);

    // ── Tipo cliente ─────────────────────────────────────────────────
    const tipoCliente: 'RNC' | 'CEDULA' | 'CONSUMIDOR' =
      factura.cliente?.rncReceptor ? 'RNC' :
      factura.cliente?.rfc?.length === 11 ? 'CEDULA' : 'CONSUMIDOR';

    // ── Condición de pago ────────────────────────────────────────────
    const diasCredito = factura.cliente?.diasCredito;
    const esCreditoPorDias = diasCredito && diasCredito > 0;
    const fechaVencimiento = esCreditoPorDias
      ? (() => {
          const dt = new Date(factura.fecha);
          dt.setDate(dt.getDate() + diasCredito!);
          return dt.toISOString();
        })()
      : undefined;

    return {
      numero:              factura.folio,
      fechaEmision:        String(factura.fecha),
      fechaVencimiento,
      tipo:                esCreditoPorDias ? 'CRÉDITO' : 'CONTADO',
      condicionPago:       esCreditoPorDias ? 'Crédito' : 'Al Contado',
      diasCredito:         diasCredito ?? undefined,
      notas:               factura.notas || '',
      moneda:              factura.moneda || 'DOP',
      esOriginal:          true,
      ecfNumero:           ecf?.numero,
      ecfTipo:             ecf?.codigo,
      ecfTipoDescripcion:  ecf?.descripcion,
      ecfCodigoSeguridad:  ecf?.codigoSeguridad,
      ecfEstadoDGII:       ecf?.estadoDGII,
      ecfFechaFirma:       ecf?.fechaFirma          ? String(ecf.fechaFirma)          : undefined,
      ecfFechaVigencia:    ecf?.secFechaVencimiento  ? String(ecf.secFechaVencimiento) : undefined,
      empresaNombre:       empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:          empresa.rnc || '',
      empresaDireccion:    empresa.direccion || '',
      empresaCiudad:       empresa.ciudad,
      empresaTelefono:     factConf.factMostrarTelefono !== false ? empresa.telefono   : undefined,
      empresaEmail:        factConf.factMostrarEmail    !== false ? empresa.email      : undefined,
      empresaSitioWeb:     factConf.factMostrarWeb      !== false ? empresa.sitioWeb   : undefined,
      empresaLogo,
      empresaColorPrimario: empresa.configuracion?.colorPrimario,
      empresaPieFactura:    empresa.configuracion?.pieFactura          as string | undefined,
      empresaTerminos:      empresa.configuracion?.terminosCondiciones as string | undefined,
      vendedorNombre:      factura.nombreVendedor,
      sucursalNombre:      undefined,
      clienteNombre:       factura.cliente?.nombre || 'Consumidor Final',
      clienteRNC:          factura.cliente?.rncReceptor || factura.cliente?.rfc,
      clienteDireccion:    factura.cliente?.direccion,
      clienteCiudad:       factura.cliente?.ciudad,
      clienteTelefono:     factura.cliente?.telefono,
      clienteEmail:        factura.cliente?.email,
      tipoCliente,
      items,
      subtotalGravado,
      subtotalExento,
      subtotalGeneral,
      descuentoTotal:      0,
      itbisTotal,
      totalGeneral,
      montoEnLetras:       this.numLetras.numeroALetras(totalGeneral),
      qrBase64,
    };
  }

  // ── Genera PDF de factura (HTML → Puppeteer) ────────────────────────
  async generarFacturaPDF(facturaId: number): Promise<{ buffer: Buffer; filename: string }> {
    const t0 = Date.now();
    const empresaId = this.tenantSvc.getEmpresaId();

    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId, isActive: true },
      relations: ['cliente', 'detalles', 'usuario'],
    });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    const data   = await this.buildFacturaData(factura);
    const html   = generarHTMLFactura(data);
    const buffer = await this.browserSvc.htmlToPDF(html, { thermal: false });

    this.logger.log(
      `PDF generado en ${Date.now() - t0} ms — ${factura.folio} — ` +
      `${factura.detalles?.length ?? 0} líneas`,
    );
    return { buffer, filename: `${factura.folio}.pdf` };
  }

  // ── Retorna HTML preview ─────────────────────────────────────────────
  async generarFacturaHTML(facturaId: number): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId, isActive: true },
      relations: ['cliente', 'detalles', 'usuario'],
    });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);
    const data = await this.buildFacturaData(factura);
    return generarHTMLFactura(data);
  }

  // ── Genera recibo térmico POS ────────────────────────────────────────
  async generarReciboPOS(facturaId: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    const empresa = await this.facturaRepo.manager
      .query('SELECT * FROM empresa WHERE id = $1 LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const ecf = factura.ecfId
      ? await this.facturaRepo.manager
          .query('SELECT numero FROM ecf WHERE id = $1 LIMIT 1', [factura.ecfId])
          .then((r: any[]) => r[0])
      : null;

    let qrBase64 = '';
    if (ecf?.numero && empresa.rnc) {
      qrBase64 = await this.generarQR(
        `https://ecf.dgii.gov.do/consulta?encf=${ecf.numero}&rnc=${empresa.rnc}`,
      );
    }

    const now = new Date();
    const fechaHora = now.toLocaleDateString('es-DO') + ' ' +
      now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

    const data: ReciboPOSData = {
      empresaNombre:   empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:      empresa.rnc || '',
      empresaTelefono: empresa.telefono,
      empresaWeb:      empresa.sitioWeb,
      vendedor:        factura.nombreVendedor,
      fechaHora,
      numero:          factura.folio,
      ecfNumero:       ecf?.numero,
      metodoPago:      factura.notas?.includes('Tarjeta')
        ? 'Tarjeta'
        : factura.notas?.includes('Transferencia') ? 'Transferencia' : 'Efectivo',
      items: (factura.detalles || []).map(d => ({
        descripcion: d.descripcion,
        cantidad:    Number(d.cantidad),
        precio:      Number(d.precioUnitario),
        total:       Number(d.precioUnitario) * Number(d.cantidad) *
                     (1 + Number(d.porcentajeIva ?? 0) / 100),
      })),
      subtotal:  Number(factura.subtotal ?? 0),
      itbis:     Number(factura.iva      ?? 0),
      total:     Number(factura.total    ?? 0),
      qrBase64,
    };

    const buffer = await generarReciboPOSPDF(data);
    return { buffer, filename: `recibo-${factura.folio}.pdf` };
  }
}
