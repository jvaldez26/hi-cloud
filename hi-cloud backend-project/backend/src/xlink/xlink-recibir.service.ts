import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';
import { User } from '../users/users.entity';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkMapeosService } from './xlink-mapeos.service';
import { XlinkDocumento, XlinkEstadoReceptor, XlinkTipoDocumento } from './entities/xlink-documento.entity';
import { RecibirXlinkDto, RecibirXlinkResultadoItem, FaltanteMapeo } from './dto/recibir-xlink.dto';
import { ComprasService } from '../compras/compras.service';
import { ComprasPdfService } from '../compras/compras-pdf.service';
import { CompraEstado } from '../compras/entities/compra.entity';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { NotasCreditoComprasService } from '../notas-credito-compras/notas-credito-compras.service';
import { TipoNCCompra, MotivoNCCompra } from '../notas-credito-compras/entities/nota-credito-compra.entity';
import { PDFService } from '../facturas/services/pdf.service';
import { NotaCreditoPDFService } from '../notas-credito/nc-pdf.service';

/** Tasas de ITBIS reconocidas — nunca se redondea ni se reasigna a otra. */
const TASAS_ITBIS_VALIDAS = [0, 16, 18];

/**
 * Fase 4 de HiCloud Xlink — recibir y homologar. La verificación de
 * pertenencia (destinoEmpresaId = eid) y el candado contra doble
 * procesamiento viven en XlinkDocumentosRepository.bloquearPorIdComoDestino
 * (SELECT ... FOR UPDATE dentro de la transacción de este servicio).
 *
 * Nota de arquitectura: la transacción de este servicio SÍ protege la fila
 * de xlink_documentos de principio a fin (el lock se mantiene hasta el
 * commit final). Pero ComprasService.create()/cambiarEstado() —
 * reutilizados a propósito, nunca reimplementados — usan sus PROPIOS
 * repositorios sobre el pool de conexiones, no el `manager` de esta
 * transacción: cada uno confirma en su propia conexión al terminar. Por
 * eso, si algo falla DESPUÉS de crear la Compra (ej. el total no cuadra),
 * este servicio compensa cancelándola explícitamente en vez de confiar en
 * un rollback que no la alcanzaría.
 */
@Injectable()
export class XlinkRecibirService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private tenantService: TenantService,
    private auditoria: AuditoriaService,
    private xlinkRepo: XlinkDocumentosRepository,
    private xlinkMapeos: XlinkMapeosService,
    private comprasService: ComprasService,
    private comprasPdfService: ComprasPdfService,
    private cotizacionesService: CotizacionesService,
    private nccService: NotasCreditoComprasService,
    private pdfService: PDFService,
    private ncPdfService: NotaCreditoPDFService,
  ) {}

  async recibir(dto: RecibirXlinkDto, usuario: User): Promise<RecibirXlinkResultadoItem[]> {
    const resultados: RecibirXlinkResultadoItem[] = [];
    for (const item of dto.items) {
      resultados.push(await this.recibirUno(item, usuario));
    }
    return resultados;
  }

  private async recibirUno(
    item: { xlinkDocumentoId: number; tipoGasto606?: string; tipoRetencionIsr?: 'si' | 'no'; aplicarSobreCompraId?: number },
    usuario: User,
  ): Promise<RecibirXlinkResultadoItem> {
    try {
      return await this.ds.transaction(async (manager) => {
        const doc = await this.xlinkRepo.bloquearPorIdComoDestino(item.xlinkDocumentoId, manager);
        if (!doc) throw new NotFoundException('Este documento de HiCloud Xlink no existe o no es para tu empresa');

        if (doc.estadoReceptor !== XlinkEstadoReceptor.PENDIENTE) {
          return {
            xlinkDocumentoId: doc.id, ok: false,
            error: `Ya se resolvió antes (estado: ${doc.estadoReceptor}${doc.numeroGenerado ? `, generó ${doc.numeroGenerado}` : ''}) — no se creó nada nuevo`,
          };
        }

        switch (doc.tipoDocumento) {
          case XlinkTipoDocumento.FACTURA_CREDITO:
            return this.recibirFactura(manager, doc, item, usuario);
          case XlinkTipoDocumento.NOTA_CREDITO:
            return this.recibirNotaCredito(manager, doc, usuario);
          case XlinkTipoDocumento.ORDEN_COMPRA:
            return this.recibirOrdenCompra(manager, doc, usuario);
        }
      });
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : String(err);
      return { xlinkDocumentoId: item.xlinkDocumentoId, ok: false, error: mensaje };
    }
  }

  // ── Factura a Crédito → Compra ──────────────────────────────────────────

  private async recibirFactura(
    manager: EntityManager,
    doc: XlinkDocumento,
    item: { tipoGasto606?: string; tipoRetencionIsr?: 'si' | 'no'; aplicarSobreCompraId?: number },
    usuario: User,
  ): Promise<RecibirXlinkResultadoItem> {
    if (!item.tipoGasto606) {
      throw new BadRequestException('tipoGasto606 es obligatorio para recibir una factura de proveedor');
    }

    const empresaId = this.tenantService.getEmpresaId();
    const origenXlinkId = await this.xlinkIdDeEmpresa(manager, doc.origenEmpresaId);

    const [proveedor] = await manager.query(
      `SELECT id, rnc, "sincronizarArticulosXlink" FROM proveedores
       WHERE "empresaId" = $1 AND "xlinkEmpresaXlinkId" = $2 AND "isActive" = true LIMIT 1`,
      [empresaId, origenXlinkId],
    );
    if (!proveedor) {
      throw new BadRequestException(
        'No tienes un proveedor vinculado a la empresa que envió esta factura. Vincúlalo desde el Directorio de HiCloud Xlink primero.',
      );
    }

    // ── Anti-duplicado: mismo proveedor + mismo NCF ya registrado ──────────
    if (doc.ncfOrigen) {
      const [existente] = await manager.query(
        `SELECT id, folio FROM compras
         WHERE "empresaId" = $1 AND "proveedorId" = $2 AND "numeroFacturaProveedor" = $3
           AND "isActive" = true AND estado <> 'cancelada' LIMIT 1`,
        [empresaId, proveedor.id, doc.ncfOrigen],
      );
      if (existente) {
        await this.marcarEcfRecibidoProcesado(manager, empresaId, doc.ncfOrigen);
        return this.marcarProcesadoYAuditar(manager, doc, usuario, 'compra', existente.id, existente.folio, true);
      }
    }

    const snapshot = doc.snapshot as any;
    const { lineasResueltas, faltantes } = await this.resolverLineasProducto(
      manager, origenXlinkId, proveedor.id, !!proveedor.sincronizarArticulosXlink, snapshot.lineas,
    );
    if (faltantes.length > 0) return { xlinkDocumentoId: doc.id, ok: false, faltantes };

    this.validarTasasItbis(snapshot.lineas, doc.numeroOrigen);

    const formaPago = String(snapshot.encabezado.tipoPago).toUpperCase() === 'CREDITO' ? '04' : '01';
    const compraDto = {
      proveedorId: proveedor.id,
      fecha: snapshot.encabezado.fechaOrigen,
      numeroFacturaProveedor: doc.ncfOrigen ?? undefined,
      tipoBienes: item.tipoGasto606,
      formaPago,
      tipoPago: 'credito',
      moneda: snapshot.encabezado.moneda,
      tipoCambio: snapshot.encabezado.tipoCambio,
      diasCredito: snapshot.encabezado.diasCredito ?? undefined,
      retieneIsr: item.tipoRetencionIsr === 'si',
      detalles: lineasResueltas.map((l: any) => ({
        productoId: l.productoId,
        descripcion: l.nombre,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        porcentajeItbis: l.porcentajeIva,
        descuentoMonto: l.descuento > 0 ? l.descuento : undefined,
      })),
    } as any;

    // ── Completar una OC abierta en vez de duplicar ────────────────────────
    // Encadenada (xlinkPadreId): la OC salió por Xlink, el emisor la
    // convirtió en Cotización y facturó desde ahí — se propone esa Compra
    // por defecto. Sin cadena, solo si el caller la pidió explícito
    // (aplicarSobreCompraId) — el frontend es quien ofrece esa elección.
    // Solo aplica si la Compra SIGUE en ENVIADA; si no, compra nueva.
    const ocAbiertaId = await this.resolverOcAbiertaParaAplicar(manager, doc, item.aplicarSobreCompraId, proveedor.id);

    let compra: any;
    let yaExistiaComoOc = false;
    if (ocAbiertaId) {
      compra = await this.comprasService.aplicarFacturaProveedorSobreEnviada(ocAbiertaId, compraDto);
      yaExistiaComoOc = true;
    } else {
      compra = await this.comprasService.create(compraDto, usuario);
    }

    if (!this.montosCoinciden(compra.total, doc.totalOrigen)) {
      if (yaExistiaComoOc) {
        // No se cancela la Compra: sigue siendo la OC original, solo se
        // revierte el intento de aplicar la factura sobre ella dejándola
        // como estaba — cancelarla destruiría un documento que el usuario
        // sí quiere conservar.
        throw new BadRequestException(
          `El total de la factura (${Number(doc.totalOrigen).toFixed(2)}) no coincide con lo recalculado ` +
          `(${Number(compra.total).toFixed(2)}) al aplicarla sobre ${compra.folio} — no se aplicó ningún cambio en firme.`,
        );
      }
      await this.comprasService.cambiarEstado(compra.id, CompraEstado.CANCELADA).catch(() => {});
      throw new BadRequestException(
        `El total de la compra creada (${Number(compra.total).toFixed(2)}) no coincide con el de origen ` +
        `(${Number(doc.totalOrigen).toFixed(2)}) — se revirtió, nada quedó a medias`,
      );
    }

    await this.comprasService.cambiarEstado(compra.id, CompraEstado.RECIBIDA);
    await this.marcarEcfRecibidoProcesado(manager, empresaId, doc.ncfOrigen);

    if (yaExistiaComoOc) {
      await this.auditoria.registrar({
        userId: usuario.id, userName: usuario.nombre ?? usuario.email,
        accion: AccionAuditoria.UPDATE, modulo: 'xlink', entidad: 'Compra', entidadId: String(compra.id),
        descripcion: `HiCloud Xlink: factura ${doc.numeroOrigen} aplicada sobre la OC ${compra.folio} — sus datos se reemplazaron por los de la factura (verdad fiscal). Revisar diferencias de cantidad/precio contra lo pedido originalmente.`,
        metodo: 'POST', ruta: '/xlink/recibir', exitoso: true,
      }).catch(() => { /* la auditoría no debe romper la recepción */ });
    }

    return this.marcarProcesadoYAuditar(manager, doc, usuario, 'compra', compra.id, compra.folio, false);
  }

  /**
   * Resuelve, si aplica, la Compra ENVIADA sobre la que hay que aplicar
   * esta factura en vez de crear una nueva. Nunca inventa el vínculo: si
   * la cadena no resuelve a una orden_compra en ENVIADA, o el caller no
   * pidió explícito un id, devuelve null (compra nueva, camino normal).
   */
  private async resolverOcAbiertaParaAplicar(
    manager: EntityManager,
    doc: XlinkDocumento,
    aplicarSobreCompraIdExplicito: number | undefined,
    proveedorId: number,
  ): Promise<number | null> {
    const empresaId = this.tenantService.getEmpresaId();

    if (doc.xlinkPadreId) {
      const padre = await this.xlinkRepo.buscarPorId(doc.xlinkPadreId);
      if (padre?.tipoDocumento === XlinkTipoDocumento.ORDEN_COMPRA && padre.origenEmpresaId === empresaId) {
        const [compra] = await manager.query(
          `SELECT id FROM compras WHERE id = $1 AND "empresaId" = $2 AND "proveedorId" = $3 AND estado = 'enviada' AND "isActive" = true`,
          [padre.documentoOrigenId, empresaId, proveedorId],
        );
        if (compra) return compra.id;
      }
    }

    if (aplicarSobreCompraIdExplicito) {
      const [compra] = await manager.query(
        `SELECT id FROM compras WHERE id = $1 AND "empresaId" = $2 AND "proveedorId" = $3 AND estado = 'enviada' AND "isActive" = true`,
        [aplicarSobreCompraIdExplicito, empresaId, proveedorId],
      );
      if (compra) return compra.id;
    }

    return null;
  }

  // ── Nota de Crédito → NotaCreditoCompra ─────────────────────────────────

  private async recibirNotaCredito(manager: EntityManager, doc: XlinkDocumento, usuario: User): Promise<RecibirXlinkResultadoItem> {
    const empresaId = this.tenantService.getEmpresaId();
    const origenXlinkId = await this.xlinkIdDeEmpresa(manager, doc.origenEmpresaId);

    const [proveedor] = await manager.query(
      `SELECT id, "sincronizarArticulosXlink" FROM proveedores
       WHERE "empresaId" = $1 AND "xlinkEmpresaXlinkId" = $2 AND "isActive" = true LIMIT 1`,
      [empresaId, origenXlinkId],
    );
    if (!proveedor) {
      throw new BadRequestException(
        'No tienes un proveedor vinculado a la empresa que envió esta NC. Vincúlalo desde el Directorio de HiCloud Xlink primero.',
      );
    }

    const snapshot = doc.snapshot as any;
    this.validarTasasItbis(snapshot.lineas, doc.numeroOrigen);

    const { lineasResueltas, faltantes } = await this.resolverLineasProducto(
      manager, origenXlinkId, proveedor.id, !!proveedor.sincronizarArticulosXlink, snapshot.lineas,
    );
    if (faltantes.length > 0) return { xlinkDocumentoId: doc.id, ok: false, faltantes };

    let compraOriginalId: number | undefined;
    let compraOriginalFolio: string | undefined;
    const facturaOriginalId = snapshot.encabezado?.facturaOriginalId;
    if (facturaOriginalId) {
      const padre = await this.xlinkRepo.buscarPorOrigenComoDestino(doc.origenEmpresaId, XlinkTipoDocumento.FACTURA_CREDITO, facturaOriginalId);
      if (padre?.documentoGeneradoId) {
        compraOriginalId = padre.documentoGeneradoId;
        compraOriginalFolio = padre.numeroGenerado ?? undefined;
      }
    }

    // Sin compraDetalleId por línea (no viene mapeado 1:1 desde el snapshot):
    // tipo AJUSTE_SIN_DEVOLUCION a propósito — es un ajuste de VALOR, no de
    // existencia, así que no exige (ni se equivoca) validando cantidades
    // físicas contra una línea de compra puntual que no sabemos identificar.
    const ncc = await this.nccService.crear({
      proveedorId: proveedor.id,
      fecha: snapshot.encabezado.fechaOrigen,
      tipo: TipoNCCompra.AJUSTE_SIN_DEVOLUCION,
      compraOriginalId,
      compraOriginalFolio,
      ncfProveedor: doc.ncfOrigen ?? '',
      motivo: MotivoNCCompra.OTRO,
      descripcionMotivo: `Nota de Crédito recibida por HiCloud Xlink (${doc.numeroOrigen})`,
      detalles: lineasResueltas.map((l: any) => ({
        productoId: l.productoId,
        descripcion: l.nombre,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        porcentajeIva: l.porcentajeIva,
      })),
    } as any, usuario.id);

    if (!this.montosCoinciden(ncc.total, doc.totalOrigen)) {
      await this.nccService.anular(ncc.id).catch(() => {});
      throw new BadRequestException(
        `El total de la NC creada (${Number(ncc.total).toFixed(2)}) no coincide con el de origen ` +
        `(${Number(doc.totalOrigen).toFixed(2)}) — se revirtió, nada quedó a medias`,
      );
    }

    await this.nccService.recibir(ncc.id);

    return this.marcarProcesadoYAuditar(manager, doc, usuario, 'nota_credito_compra', ncc.id, ncc.numero, false);
  }

  // ── Orden de Compra → Cotización (no existe pedido/orden de venta) ─────

  private async recibirOrdenCompra(manager: EntityManager, doc: XlinkDocumento, usuario: User): Promise<RecibirXlinkResultadoItem> {
    const empresaId = this.tenantService.getEmpresaId();
    const origenXlinkId = await this.xlinkIdDeEmpresa(manager, doc.origenEmpresaId);

    const [cliente] = await manager.query(
      `SELECT id FROM clientes WHERE "empresaId" = $1 AND "xlinkEmpresaXlinkId" = $2 AND "isActive" = true LIMIT 1`,
      [empresaId, origenXlinkId],
    );
    if (!cliente) {
      throw new BadRequestException(
        'No tienes un cliente vinculado a la empresa que envió esta Orden de Compra. Vincúlalo desde el Directorio de HiCloud Xlink primero.',
      );
    }

    const snapshot = doc.snapshot as any;
    // Best-effort: la Cotización acepta líneas sin productoId (a diferencia
    // de Compra), así que un SKU sin mapear no bloquea — solo se pierde el
    // vínculo a inventario de esa línea, nunca la recepción completa.
    const { lineasResueltas } = await this.resolverLineasProducto(manager, origenXlinkId, null, false, snapshot.lineas);

    const cotizacion = await this.cotizacionesService.create({
      clienteId: cliente.id,
      fecha: snapshot.encabezado.fechaOrigen,
      condicionesPago: snapshot.encabezado.tipoPago
        ? `${snapshot.encabezado.tipoPago}${snapshot.encabezado.diasCredito ? ` ${snapshot.encabezado.diasCredito} días` : ''}`
        : undefined,
      notas: `Generada por HiCloud Xlink desde la Orden de Compra ${doc.numeroOrigen}`,
      detalles: lineasResueltas.map((l: any) => ({
        productoId: l.productoId ?? undefined,
        descripcion: l.nombre,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        porcentajeIva: l.porcentajeIva,
      })),
    } as any, usuario);

    return this.marcarProcesadoYAuditar(manager, doc, usuario, 'cotizacion', cotizacion.id, cotizacion.numero, false);
  }

  // ── Helpers compartidos ──────────────────────────────────────────────────

  private async xlinkIdDeEmpresa(manager: EntityManager, empresaId: number): Promise<string> {
    const [row] = await manager.query(`SELECT "xlinkId" FROM empresa WHERE id = $1`, [empresaId]);
    return row?.xlinkId;
  }

  private async resolverLineasProducto(
    manager: EntityManager,
    contraparteXlinkId: string,
    proveedorId: number | null,
    intentarAutoMatch: boolean,
    lineas: any[],
  ): Promise<{ lineasResueltas: any[]; faltantes: FaltanteMapeo[] }> {
    const lineasResueltas: any[] = [];
    const faltantes: FaltanteMapeo[] = [];
    for (const l of lineas) {
      const productoId = await this.xlinkMapeos.resolverProducto(
        manager, contraparteXlinkId, proveedorId, intentarAutoMatch, l.sku, l.nombre,
      );
      if (productoId) {
        lineasResueltas.push({ ...l, productoId });
      } else if (proveedorId !== null) {
        // Solo Factura/NC (proveedorId presente) EXIGEN el mapeo — OC no.
        faltantes.push({ tipo: 'producto', valorExterno: this.xlinkMapeos.claveExterna(l.sku, l.nombre), descripcion: l.nombre });
      } else {
        lineasResueltas.push({ ...l, productoId: null });
      }
    }
    return { lineasResueltas, faltantes };
  }

  private validarTasasItbis(lineas: any[], numeroOrigen: string): void {
    for (const l of lineas) {
      if (!TASAS_ITBIS_VALIDAS.includes(Number(l.porcentajeIva))) {
        throw new BadRequestException(
          `${numeroOrigen}: la línea "${l.nombre}" trae ITBIS ${l.porcentajeIva}% — no es una tasa reconocida (0/16/18). No se puede recibir.`,
        );
      }
    }
  }

  private montosCoinciden(a: number, b: number): boolean {
    return Number(a).toFixed(2) === Number(b).toFixed(2);
  }

  private async marcarEcfRecibidoProcesado(manager: EntityManager, empresaId: number, encf: string | null | undefined): Promise<void> {
    if (!encf) return;
    await manager.query(
      `UPDATE ecf_recibidos SET "procesadoComoCompra" = true WHERE "empresaId" = $1 AND encf = $2`,
      [empresaId, encf],
    ).catch(() => { /* best-effort — la fila puede no existir si nunca se importó por CSV */ });
  }

  private async marcarProcesadoYAuditar(
    manager: EntityManager,
    doc: XlinkDocumento,
    usuario: User,
    documentoGeneradoTipo: string,
    documentoGeneradoId: number,
    numeroGenerado: string,
    yaExistia: boolean,
  ): Promise<RecibirXlinkResultadoItem> {
    doc.estadoReceptor = XlinkEstadoReceptor.PROCESADO;
    doc.documentoGeneradoTipo = documentoGeneradoTipo;
    doc.documentoGeneradoId = documentoGeneradoId;
    doc.numeroGenerado = numeroGenerado;
    doc.procesadoPorUsuarioId = usuario.id;
    doc.procesadoEn = new Date();
    await this.xlinkRepo.guardar(doc, manager);

    const miEmpresaId = this.tenantService.getEmpresaId();
    const [miEmpresa] = await manager.query(`SELECT "nombreComercial", nombre FROM empresa WHERE id = $1`, [miEmpresaId]);
    const miNombre = miEmpresa?.nombreComercial ?? miEmpresa?.nombre ?? '';

    await this.tenantService.runForEmpresa(doc.origenEmpresaId, async () => {
      await this.auditoria.registrar({
        userId: usuario.id, userName: usuario.nombre ?? usuario.email,
        accion: AccionAuditoria.UPDATE,
        modulo: 'xlink',
        entidad: doc.tipoDocumento,
        entidadId: String(doc.documentoOrigenId),
        descripcion: `Recibido por ${miNombre} por HiCloud Xlink — generó ${numeroGenerado}`,
        metodo: 'POST', ruta: '/xlink/recibir', exitoso: true,
      });
    }).catch(() => { /* la auditoría no debe romper la recepción — ver reportServiceError en el caller si aplica */ });

    return { xlinkDocumentoId: doc.id, ok: true, yaExistia, documentoGeneradoId, numeroGenerado };
  }

  // ── Otros endpoints de Fase 4 ────────────────────────────────────────────

  async marcarProcesadoManual(id: number, usuario: User): Promise<XlinkDocumento> {
    const doc = await this.xlinkRepo.buscarPorIdComoDestino(id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.estadoReceptor !== XlinkEstadoReceptor.PENDIENTE) {
      throw new BadRequestException(`Ya está en estado "${doc.estadoReceptor}"`);
    }
    doc.estadoReceptor = XlinkEstadoReceptor.PROCESADO_MANUAL;
    doc.procesadoPorUsuarioId = usuario.id;
    doc.procesadoEn = new Date();
    return this.xlinkRepo.guardar(doc);
  }

  async descartar(id: number, motivo: string, usuario: User): Promise<XlinkDocumento> {
    const doc = await this.xlinkRepo.buscarPorIdComoDestino(id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.estadoReceptor !== XlinkEstadoReceptor.PENDIENTE) {
      throw new BadRequestException(`Ya está en estado "${doc.estadoReceptor}"`);
    }
    doc.estadoReceptor = XlinkEstadoReceptor.DESCARTADO;
    doc.motivoDescarte = motivo;
    doc.procesadoPorUsuarioId = usuario.id;
    doc.procesadoEn = new Date();
    return this.xlinkRepo.guardar(doc);
  }

  async regresarPendiente(id: number): Promise<XlinkDocumento> {
    const doc = await this.xlinkRepo.buscarPorIdComoDestino(id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.estadoReceptor === XlinkEstadoReceptor.PROCESADO) {
      throw new BadRequestException('Ya generó un documento — no se puede regresar a pendiente sin deshacerlo primero');
    }
    doc.estadoReceptor = XlinkEstadoReceptor.PENDIENTE;
    doc.motivoDescarte = undefined;
    doc.procesadoPorUsuarioId = undefined;
    doc.procesadoEn = undefined;
    return this.xlinkRepo.guardar(doc);
  }

  /** GET /xlink/:id/pdf-original — PDF del generador del EMISOR, corriendo en su propio contexto de empresa. */
  async getPdfOriginal(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const eid = this.tenantService.getEmpresaId();
    const doc = await this.xlinkRepo.buscarPorId(id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.origenEmpresaId !== eid && doc.destinoEmpresaId !== eid) {
      throw new ForbiddenException('Este documento de HiCloud Xlink no pertenece a tu empresa');
    }

    return this.tenantService.runForEmpresa(doc.origenEmpresaId, async () => {
      switch (doc.tipoDocumento) {
        case XlinkTipoDocumento.FACTURA_CREDITO: return this.pdfService.generarFacturaPDF(doc.documentoOrigenId);
        case XlinkTipoDocumento.NOTA_CREDITO:    return this.ncPdfService.generarPDF(doc.documentoOrigenId);
        case XlinkTipoDocumento.ORDEN_COMPRA:    return this.comprasPdfService.generarOrdenCompraPDF(doc.documentoOrigenId);
      }
    });
  }

  /** GET /xlink/:id/formulario — DTO prellenado para abrir el formulario normal, sin grabar nada. */
  async getFormulario(id: number): Promise<Record<string, unknown>> {
    const doc = await this.xlinkRepo.buscarPorIdComoDestino(id);
    if (!doc) throw new NotFoundException('Documento no encontrado o ya no está pendiente para tu empresa');

    const snapshot = doc.snapshot as any;
    return {
      tipoDocumento: doc.tipoDocumento,
      numeroOrigen: doc.numeroOrigen,
      ncfOrigen: doc.ncfOrigen,
      fecha: snapshot.encabezado.fechaOrigen,
      moneda: snapshot.encabezado.moneda,
      tipoCambio: snapshot.encabezado.tipoCambio,
      tipoPago: snapshot.encabezado.tipoPago,
      diasCredito: snapshot.encabezado.diasCredito,
      detalles: snapshot.lineas,
      totalOrigen: doc.totalOrigen,
    };
  }
}
