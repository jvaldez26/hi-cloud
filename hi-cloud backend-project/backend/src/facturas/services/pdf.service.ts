import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as qrcode from 'qrcode';
import { Factura } from '../entities/factura.entity';
import { TenantService } from '../../tenant/tenant.service';
import { NumeroLetrasService } from './numero-letras.service';
import type { FacturaPDFData, FacturaPDFItem } from '../templates/factura.template';
import { generarHTMLFactura }  from '../templates/factura.template';
import type { ReciboPOSData }  from '../templates/recibo-termico.template';
import { generarFacturaPDF, generarReciboPOSPDF } from '../../common/pdf/factura-pdf.helper';

@Injectable()
export class PDFService {
  private readonly logger = new Logger(PDFService.name);

  constructor(
    @InjectRepository(Factura)
    private facturaRepo: Repository<Factura>,
    private tenantSvc:   TenantService,
    private numLetras:   NumeroLetrasService,
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

  // ── Descarga logo → Buffer ────────────────────────────────────────
  private async logoBuffer(logoUrl: string | undefined): Promise<Buffer | undefined> {
    if (!logoUrl) return undefined;
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return undefined;
      return Buffer.from(await res.arrayBuffer());
    } catch (e: any) {
      this.logger.warn(`Logo no descargado (${logoUrl}): ${e?.message}`);
      return undefined;
    }
  }

  // ── Construye FacturaPDFData desde la entidad ───────────────────────
  private async buildFacturaData(
    factura: Factura,
    empresaIdParam?: number,
  ): Promise<{ data: FacturaPDFData; logoBuf?: Buffer; logoAlturaMm: number }> {
    const empresaId = empresaIdParam ?? this.tenantSvc.getEmpresaId();

    const empresa = await this.facturaRepo.manager.query(
      'SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    ).then((rows: any[]) => rows[0] || {});

    // CRÍTICO: buscar ECF por 3 vías — el campo factura.ecfId puede ser null
    // si el e-CF fue aprobado después de crear la factura y no se backfilló.
    // Fallback 1: ecf.facturaId = factura.id
    // Fallback 2: ecf.documentoOrigenId = factura.id (vinculación genérica)
    // LEFT JOIN para evitar que la ausencia de secuencia anule el resultado.
    const ecf = await this.facturaRepo.manager.query(
      `SELECT e.*, t.codigo, t.descripcion,
              s."fechaVencimiento" AS "secFechaVencimiento"
         FROM ecf e
         LEFT JOIN tipos_ecf      t ON t.id = e."tipoECFId"
         LEFT JOIN secuencias_ecf s ON s.id = e."secuenciaId"
        WHERE e."empresaId" = $1
          AND (
            e.id = $2
            OR e."facturaId" = $3
            OR (e."documentoOrigenId" = $3 AND e."documentoOrigenTipo" = 'FACTURA')
          )
        ORDER BY e."createdAt" DESC LIMIT 1`,
      [empresaId, factura.ecfId ?? -1, factura.id],
    ).then((r: any[]) => r[0] ?? null);

    let qrBase64 = '';
    if (ecf?.numero && empresa.rnc) {
      const urlQR = ecf.qrUrl
        ?? `https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${empresa.rnc}&eNCF=${ecf.numero}` +
           (ecf.codigoSeguridad ? `&CodigoSeguridadNCF=${ecf.codigoSeguridad}` : '');
      qrBase64 = await this.generarQR(urlQR);
    }

    const factConf   = (empresa.configuracion ?? {}) as Record<string, unknown>;
    const logoBuf    = factConf.factMostrarLogo !== false
      ? await this.logoBuffer(empresa.logo)
      : undefined;

    // Convertir logo a base64 data URL — embedding seguro en template HTML sin onerror
    // (evita que comillas dobles en el atributo onerror corrompan el HTML)
    const logoDataUrl = logoBuf
      ? `data:image/png;base64,${logoBuf.toString('base64')}`
      : undefined;

    const r2pdf = (n: number) => Math.round(n * 100) / 100;

    const items: FacturaPDFItem[] = (factura.detalles || []).map((d, i) => {
      const itbisPct  = Number(d.porcentajeIva ?? 18);
      const dm        = Number(d.descuentoMonto ?? 0);
      const dp        = Number(d.descuentoPct   ?? 0);
      // MISMA convención A/B que facturas.service al calcular la factura:
      //   B (POS, con precioOriginal): precioUnitario YA es el neto → la base es
      //     precioOriginal y el descuento se resta UNA sola vez.
      //   A (Facturas regular, sin precioOriginal): la base es precioUnitario.
      // Sin esto el PDF restaba el descuento dos veces y su subtotal no cuadraba
      // con el ITBIS y el total leídos de la factura.
      const precioOrig = (d as any).precioOriginal != null ? Number((d as any).precioOriginal) : null;
      const convencionB = precioOrig != null && dm > 0;
      const precioBase = convencionB ? precioOrig! : Number(d.precioUnitario);
      const bruto      = r2pdf(precioBase * Number(d.cantidad));
      let descLinea    = 0;
      if (convencionB)      descLinea = r2pdf(dm * Number(d.cantidad));
      else if (dm > 0)      descLinea = r2pdf(Math.min(dm, bruto));
      else if (dp > 0)      descLinea = r2pdf(bruto * (dp / 100));
      const subtotal  = r2pdf(bruto - descLinea);
      const impIva    = r2pdf(subtotal * (itbisPct / 100));
      return {
        numero:         i + 1,
        codigo:         (d as any).producto?.codigo,
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        unidadMedida:   (d as any).producto?.unidadMedida ?? 'UN',
        // En convención B se muestra el precio de lista; el descuento va en su columna
        precioUnitario: precioBase,
        descuentoPct:   dp,
        descuentoMonto: descLinea > 0 ? descLinea : 0,
        subtotal,
        itbisPct,
        importeItbis:   impIva,
        total:          r2pdf(subtotal + impIva),
      };
    });

    // subtotalGravado/Exento/General = post línea, pre descuento general
    const subtotalGravado = r2pdf(items.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0));
    const subtotalExento  = r2pdf(items.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0));
    const subtotalNetoPre = r2pdf(subtotalGravado + subtotalExento);

    // Descuento general desde entity
    let descGeneral = 0;
    const dgt = (factura as any).descuentoGeneralTipo as string | undefined;
    const dgv = Number((factura as any).descuentoGeneralValor ?? 0);
    if (dgt === 'monto' && dgv > 0) {
      descGeneral = r2pdf(Math.min(dgv, subtotalNetoPre));
    } else if (dgt === 'porcentaje' && dgv > 0) {
      descGeneral = r2pdf(subtotalNetoPre * (dgv / 100));
    }

    const subtotalGeneral = subtotalNetoPre;   // se muestra pre-descuento-general; el desc aparece aparte
    const itbisTotal      = Number(factura.iva   ?? 0);
    const totalGeneral    = Number(factura.total  ?? 0);

    // ── Comprador: fuente ÚNICA = snapshot del e-CF (lo que se ENVIÓ a DGII) ──
    // El registro `ecf` ya se cargó arriba (SELECT e.*), así que NO hay consulta
    // extra ni re-resolución del cliente. El comprador se toma del MISMO snapshot
    // que usó el XML (ecf.rncComprador / ecf.razonSocialComprador / ecf.direccionComprador).
    // Solo si el documento NO es fiscal (sin e-CF) se cae a la relación `cliente`.
    // Esto une PDF y XML en una sola fuente y evita que el merge en memoria de
    // emitir-ecf (que nunca se persiste al clienteId) haga que el PDF muestre
    // "Consumidor Final" mientras el XML/DGII tiene el comprador real.
    const compradorRNC: string | undefined =
      ecf?.rncComprador
      ?? (factura as any).rncComprador
      ?? factura.cliente?.rncReceptor
      ?? factura.cliente?.rfc
      ?? undefined;
    const compradorNombre: string =
      ecf?.razonSocialComprador
      || factura.cliente?.nombre
      || 'Consumidor Final';
    const compradorDireccion: string | undefined =
      ecf?.direccionComprador
      ?? factura.cliente?.direccion;

    const tipoCliente: 'RNC' | 'CEDULA' | 'CONSUMIDOR' =
      !compradorRNC || compradorRNC === '00000000000' ? 'CONSUMIDOR' :
      compradorRNC.length === 11 ? 'CEDULA' : 'RNC';

    // Usar tipoPago de la FACTURA (no del cliente) para determinar contado vs crédito
    const esCreditoPorDias = factura.tipoPago === 'CREDITO';
    const diasCredito = esCreditoPorDias && factura.diasCredito > 0
      ? factura.diasCredito : undefined;
    const fechaVencimiento = esCreditoPorDias
      ? (factura.fechaVencimiento
          ? String(factura.fechaVencimiento)
          : (() => {
              const dt = new Date(factura.fecha);
              dt.setDate(dt.getDate() + (diasCredito ?? 30));
              return dt.toISOString();
            })())
      : undefined;

    const data: FacturaPDFData = {
      numero:              factura.folio,
      fechaEmision:        String(factura.fecha),
      fechaVencimiento,
      tipo:                esCreditoPorDias ? 'CRÉDITO' : 'CONTADO',
      condicionPago:       esCreditoPorDias ? 'Crédito' : 'Al Contado',
      diasCredito:         diasCredito ?? undefined,
      notas:               factura.notas || '',
      moneda:              factura.moneda || 'DOP',
      tipoCambio:          factura.moneda && factura.moneda !== 'DOP' ? Number(factura.tipoCambio ?? 1) : undefined,
      esOriginal:          true,
      ecfNumero:           ecf?.numero,
      ecfTipo:             ecf?.codigo,
      ecfTipoDescripcion:  ecf?.descripcion,
      ecfCodigoSeguridad:  ecf?.codigoSeguridad,
      ecfEstadoDGII:       ecf?.estadoDGII,
      ecfFechaFirma:       (() => {
        if (ecf?.fechaFirma) return String(ecf.fechaFirma);
        const sd: string | undefined = (ecf?.respuestaMSeller as any)?.signedDate;
        if (!sd) return undefined;
        // "DD-MM-YYYY HH:MM:SS" RD (UTC-4) → ISO string para fmtDT
        const m = sd.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
        return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`).toISOString() : undefined;
      })(),
      ecfFechaVigencia:    ecf?.secFechaVencimiento  ? String(ecf.secFechaVencimiento) : undefined,
      empresaNombre:       empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
      empresaRNC:          empresa.rnc || '',
      empresaDireccion:    empresa.direccion || '',
      empresaCiudad:       empresa.ciudad,
      empresaTelefono:     factConf.factMostrarTelefono !== false ? empresa.telefono   : undefined,
      empresaEmail:        factConf.factMostrarEmail    !== false ? empresa.email      : undefined,
      empresaSitioWeb:     factConf.factMostrarWeb      !== false ? empresa.sitioWeb   : undefined,
      empresaLogo:         logoDataUrl,  // base64 data URL (evita onerror malformado)
      empresaColorPrimario: empresa.configuracion?.colorPrimario,
      empresaPieFactura:    empresa.configuracion?.pieFactura          as string | undefined,
      empresaTerminos:      empresa.configuracion?.terminosCondiciones as string | undefined,
      vendedorNombre:      factura.nombreVendedor,
      sucursalNombre:      (factura as any).sucursalId
        ? await this.facturaRepo.manager.query(
            'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
            [(factura as any).sucursalId],
          ).then((r: any[]) => r[0]?.nombre ?? undefined)
        : undefined,
      clienteNombre:                  compradorNombre,
      clienteRNC:                     compradorRNC,
      clienteIdentificadorExtranjero: (factura.cliente as any)?.identificadorExtranjero,
      clienteDireccion:               compradorDireccion,
      clienteCiudad:       factura.cliente?.ciudad,
      clienteTelefono:     factura.cliente?.telefono,
      clienteEmail:        factura.cliente?.email,
      tipoCliente,
      items,
      subtotalGravado,
      subtotalExento,
      subtotalGeneral,
      descuentoTotal:          r2pdf(descGeneral),
      descuentoGeneralTipo:    dgt,
      descuentoGeneralValor:   dgv > 0 ? dgv : undefined,
      descuentoGeneralFinal:   Number((factura as any).descuentoGeneralFinal ?? 0) > 0
        ? Number((factura as any).descuentoGeneralFinal)
        : undefined,
      itbisTotal,
      totalGeneral,
      montoEnLetras:       this.numLetras.numeroALetras(totalGeneral),
      qrBase64,
      // Retenciones
      aplicaRetenciones:    (factura as any).aplicaRetenciones === true,
      montoRetencionItbis:  Number((factura as any).montoRetencionItbis ?? 0),
      montoRetencionIsr:    Number((factura as any).montoRetencionIsr   ?? 0),
      netoCobrar:           Number((factura as any).netoCobrar ?? totalGeneral),
    };

    const logoAlturaMm = Number(factConf.posLogoAltura ?? 20);
    return { data, logoBuf, logoAlturaMm };
  }

  // ── Genera PDF de factura (PDFKit) ──────────────────────────────────
  async generarFacturaPDF(facturaId: number): Promise<{ buffer: Buffer; filename: string }> {
    const t0 = Date.now();
    const empresaId = this.tenantSvc.getEmpresaId();

    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId, isActive: true },
      relations: ['cliente', 'detalles', 'detalles.producto', 'usuario'],
    });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    const { data, logoBuf, logoAlturaMm } = await this.buildFacturaData(factura);
    const buffer = await generarFacturaPDF(data, logoBuf, logoAlturaMm);

    this.logger.log(
      `PDF generado en ${Date.now() - t0} ms — ${factura.folio} — ` +
      `${factura.detalles?.length ?? 0} líneas`,
    );
    return { buffer, filename: `${factura.folio}.pdf` };
  }

  // ── Genera PDF desde entidad ya cargada (para uso fuera del contexto HTTP, ej. cron) ──
  async generarPDFDesdeEntidad(
    factura: Factura,
    empresaId: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const t0 = Date.now();
    const { data, logoBuf, logoAlturaMm } = await this.buildFacturaData(factura, empresaId);
    const buffer = await generarFacturaPDF(data, logoBuf, logoAlturaMm);
    this.logger.log(
      `PDF (cron) generado en ${Date.now() - t0} ms — ${factura.folio}`,
    );
    return { buffer, filename: `${factura.folio}.pdf` };
  }

  // ── Retorna HTML preview del template ───────────────────────────────
  async generarFacturaHTML(facturaId: number): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId, isActive: true },
      relations: ['cliente', 'detalles', 'detalles.producto', 'usuario'],
    });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);
    const { data } = await this.buildFacturaData(factura);
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
          .query(
            'SELECT numero, "rncComprador", "razonSocialComprador" FROM ecf WHERE id = $1 LIMIT 1',
            [factura.ecfId],
          )
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

    const sucursalNombreRecibo: string | undefined = (factura as any).sucursalId
      ? await this.facturaRepo.manager.query(
          'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
          [(factura as any).sucursalId],
        ).then((r: any[]) => r[0]?.nombre ?? undefined)
      : undefined;

    const data: ReciboPOSData = {
      empresaNombre:   empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
      empresaRNC:      empresa.rnc || '',
      empresaTelefono: empresa.telefono,
      empresaWeb:      empresa.sitioWeb,
      vendedor:        factura.nombreVendedor,
      sucursal:        sucursalNombreRecibo,
      fechaHora,
      numero:          factura.folio,
      ecfNumero:       ecf?.numero,
      metodoPago:      factura.notas?.includes('Tarjeta')
        ? 'Tarjeta'
        : factura.notas?.includes('Transferencia') ? 'Transferencia' : 'Efectivo',
      items: (factura.detalles || []).map(d => {
        const subtotalF = Number(factura.subtotal ?? 0);
        const ivaF      = Number(factura.iva      ?? 0);
        const ivaEfPct  = subtotalF > 0 ? (ivaF / subtotalF) * 100 : 0;
        const pct       = Number(d.porcentajeIva) || ivaEfPct;
        const factor    = 1 + pct / 100;
        return {
          descripcion: d.descripcion,
          cantidad:    Number(d.cantidad),
          precio:      Number(d.precioUnitario) * factor,
          total:       Number(d.precioUnitario) * Number(d.cantidad) * factor,
        };
      }),
      subtotal:  Number(factura.subtotal ?? 0),
      itbis:     Number(factura.iva      ?? 0),
      total:     Number(factura.total    ?? 0),
      qrBase64,
      rncComprador:         ecf?.rncComprador
                              ?? (factura as any).rncComprador
                              ?? factura.cliente?.rncReceptor
                              ?? factura.cliente?.rfc
                              ?? undefined,
      razonSocialComprador: ecf?.razonSocialComprador
                              || factura.cliente?.nombre
                              || undefined,
    };

    const buffer = await generarReciboPOSPDF(data);
    return { buffer, filename: `recibo-${factura.folio}.pdf` };
  }
}
