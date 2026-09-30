import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TipoNotificacion } from '../notificaciones/entities/notificacion-enviada.entity';
import { XlinkService } from './xlink.service';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkEstadoReceptor, XlinkTipoDocumento } from './entities/xlink-documento.entity';
import { PublicarXlinkDto, PublicarXlinkResultadoItem } from './dto/publicar-xlink.dto';

/** e-CF aceptado por DGII, con o sin observaciones — mismo criterio que
 *  notas-credito.service.ts (getSaldoDisponible) y emitir-ecf.use-case. */
const ESTADOS_ECF_ACEPTABLES = ['aceptado', 'observado'];
/** Tolerancia de cuadratura del snapshot vs. el total guardado (redondeo por línea). */
const TOLERANCIA_CUADRE = 0.02;

interface LineaSnapshot {
  sku: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  descuento: number;
  porcentajeIva: number;
  montoItem: number;
}

interface DocumentoParaPublicar {
  numeroOrigen: string;
  ncfOrigen: string | null;
  fechaOrigen: string;
  totalOrigen: number;
  destinoNombreError: string;
  destinoXlinkId: string | null;
  moneda: string;
  tipoCambio: number;
  tipoPago?: string;
  diasCredito?: number;
  fechaLimitePago?: string | null;
  lineas: LineaSnapshot[];
  totalesConItbis: { porcentajeIva: number; base: number; itbis: number }[];
  entidadAuditoria: string;
  cotizacionGeneradaId?: number; // solo cuando aplica encadenar xlinkPadreId (factura)
}

const ENTIDAD_POR_TIPO: Record<XlinkTipoDocumento, string> = {
  [XlinkTipoDocumento.FACTURA_CREDITO]: 'Factura',
  [XlinkTipoDocumento.NOTA_CREDITO]:    'NotaCredito',
  [XlinkTipoDocumento.ORDEN_COMPRA]:    'Compra',
};

/**
 * Fase 3 de HiCloud Xlink — publicar/enviar. Cada documento se procesa de
 * forma independiente (nunca falla el lote entero por un ítem malo).
 */
@Injectable()
export class XlinkPublicarService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    @InjectRepository(Empresa) private empresaRepository: Repository<Empresa>,
    private tenantService: TenantService,
    private auditoria: AuditoriaService,
    private notificaciones: NotificacionesService,
    private xlinkService: XlinkService,
    private xlinkRepo: XlinkDocumentosRepository,
  ) {}

  async publicar(dto: PublicarXlinkDto, usuario: { id: number; nombre?: string; email?: string }): Promise<PublicarXlinkResultadoItem[]> {
    const empresaId = this.tenantService.getEmpresaId();
    await this.xlinkService.assertPuedeUsarXlink(empresaId);

    const resultados: PublicarXlinkResultadoItem[] = [];
    for (const id of dto.documentoIds) {
      try {
        await this.publicarUno(dto.tipoDocumento, id, usuario);
        resultados.push({ id, ok: true });
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : String(err);
        resultados.push({ id, ok: false, error: mensaje });
      }
    }
    return resultados;
  }

  private async publicarUno(
    tipoDocumento: XlinkTipoDocumento,
    documentoOrigenId: number,
    usuario: { id: number; nombre?: string; email?: string },
  ): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();

    if (await this.xlinkRepo.existePorOrigen(tipoDocumento, documentoOrigenId)) {
      throw new BadRequestException('Este documento ya fue publicado por HiCloud Xlink');
    }

    const doc = await this.resolverDocumento(tipoDocumento, documentoOrigenId, empresaId);

    if (!doc.destinoXlinkId) {
      throw new BadRequestException(
        `${doc.destinoNombreError} no está vinculado a ninguna empresa de HiCloud Xlink. Vincúlalo desde el Directorio primero.`,
      );
    }

    const [contraparte] = await this.ds.query(
      `SELECT id, "isActive", "xlinkVisible" FROM empresa WHERE "xlinkId" = $1`,
      [doc.destinoXlinkId],
    );
    if (!contraparte || !contraparte.isActive || !contraparte.xlinkVisible) {
      throw new BadRequestException(`${doc.destinoNombreError} ya no está visible en HiCloud Xlink`);
    }
    if (contraparte.id === empresaId) {
      throw new BadRequestException('No puedes publicar un documento hacia tu propia empresa');
    }

    this.verificarCuadre(doc);

    const emisor = await this.empresaRepository.findOne({ where: { id: empresaId } });

    const snapshot = {
      encabezado: {
        numeroOrigen: doc.numeroOrigen,
        ncfOrigen: doc.ncfOrigen,
        fechaOrigen: doc.fechaOrigen,
        moneda: doc.moneda,
        tipoCambio: doc.tipoCambio,
        tipoPago: doc.tipoPago ?? null,
        diasCredito: doc.diasCredito ?? null,
        fechaLimitePago: doc.fechaLimitePago ?? null,
        emisorRnc: emisor?.rnc ?? null,
        emisorNombre: emisor?.nombreComercial ?? emisor?.nombre ?? null,
      },
      lineas: doc.lineas,
      totalesPorTasa: doc.totalesConItbis,
    };

    let xlinkPadreId: number | undefined;
    if (doc.cotizacionGeneradaId) {
      const padre = await this.xlinkRepo.buscarPorDocumentoGeneradoComoDestino('cotizacion', doc.cotizacionGeneradaId);
      if (padre) xlinkPadreId = padre.id;
    }

    const creado = await this.xlinkRepo.crear({
      destinoEmpresaId: contraparte.id,
      tipoDocumento,
      documentoOrigenId,
      numeroOrigen: doc.numeroOrigen,
      ncfOrigen: doc.ncfOrigen ?? undefined,
      fechaOrigen: new Date(doc.fechaOrigen),
      totalOrigen: doc.totalOrigen,
      snapshot,
      xlinkPadreId,
      publicadoPorUsuarioId: usuario.id,
      publicadoEn: new Date(),
    } as any);

    await this.auditoria.registrar({
      userId: usuario.id,
      userName: usuario.nombre ?? usuario.email,
      accion: AccionAuditoria.EXPORT,
      modulo: 'xlink',
      entidad: doc.entidadAuditoria,
      entidadId: String(documentoOrigenId),
      descripcion: `Enviado por HiCloud Xlink a ${emisor?.nombreComercial ?? ''} → destino xlinkId=${doc.destinoXlinkId}`.trim(),
      metodo: 'POST',
      ruta: '/xlink/publicar',
      exitoso: true,
    });

    await this.notificaciones.notificarSistemaEmpresa(
      contraparte.id,
      TipoNotificacion.XLINK_DOCUMENTO_RECIBIDO,
      'Nuevo documento recibido por HiCloud Xlink',
      `${emisor?.nombreComercial ?? emisor?.nombre ?? 'Una empresa'} te envió ${doc.numeroOrigen} por HiCloud Xlink.`,
      String(creado.id),
    );
  }

  /**
   * Gancho TIPO B para el flujo de anulación existente de Factura/NC/ND/
   * Compra — llamar SIEMPRE envuelto en try/catch + reportServiceError en
   * el caller, nunca dejar que esto rompa una anulación real. No-op si el
   * documento nunca se publicó por Xlink.
   *
   * - pendiente          → anulado_en_origen (el receptor nunca llegó a usarlo)
   * - procesado/manual   → se notifica al receptor; su compra/documento generado NO se toca
   */
  async notificarAnulacionEnOrigen(tipoDocumento: XlinkTipoDocumento, documentoOrigenId: number): Promise<void> {
    const doc = await this.xlinkRepo.buscarPorOrigenParaAnular(tipoDocumento, documentoOrigenId);
    if (!doc) return; // nunca se publicó — nada que hacer

    if (doc.estadoReceptor === XlinkEstadoReceptor.PENDIENTE) {
      doc.estadoReceptor = XlinkEstadoReceptor.ANULADO_EN_ORIGEN;
      await this.xlinkRepo.guardar(doc);
      return;
    }

    if (doc.estadoReceptor === XlinkEstadoReceptor.PROCESADO || doc.estadoReceptor === XlinkEstadoReceptor.PROCESADO_MANUAL) {
      await this.notificaciones.notificarSistemaEmpresa(
        doc.destinoEmpresaId,
        TipoNotificacion.XLINK_DOCUMENTO_RECIBIDO,
        'Documento anulado en origen',
        `${doc.numeroOrigen} (que ya procesaste) fue ANULADO por quien lo envió. Revísalo — el documento que generaste con él NO se modificó automáticamente.`,
        String(doc.id),
      );
    }
  }

  /** DELETE /xlink/enviados/:id — solo si el receptor AÚN no lo procesó. */
  async eliminarEnviado(id: number): Promise<void> {
    const doc = await this.xlinkRepo.buscarPorIdComoOrigen(id);
    if (!doc) throw new BadRequestException('Este documento enviado no existe o no te pertenece');
    if (doc.estadoReceptor !== XlinkEstadoReceptor.PENDIENTE) {
      throw new BadRequestException(
        'No puedes retirar este envío — el receptor ya lo procesó, descartó, o ya no está pendiente',
      );
    }
    doc.isActive = false;
    await this.xlinkRepo.guardar(doc);
  }

  private verificarCuadre(doc: DocumentoParaPublicar): void {
    const sumaBase  = doc.totalesConItbis.reduce((acc, t) => acc + t.base, 0);
    const sumaItbis = doc.totalesConItbis.reduce((acc, t) => acc + t.itbis, 0);
    const sumaTotal = +(sumaBase + sumaItbis).toFixed(2);
    const diferencia = Math.abs(sumaTotal - Number(doc.totalOrigen));

    if (diferencia > TOLERANCIA_CUADRE) {
      throw new BadRequestException(
        `El documento no cuadra: la suma de líneas (${sumaTotal.toFixed(2)}) no coincide con el total guardado ` +
        `(${Number(doc.totalOrigen).toFixed(2)}). No se publicó.`,
      );
    }
  }

  private async resolverDocumento(
    tipoDocumento: XlinkTipoDocumento,
    id: number,
    empresaId: number,
  ): Promise<DocumentoParaPublicar> {
    switch (tipoDocumento) {
      case XlinkTipoDocumento.FACTURA_CREDITO: return this.resolverFactura(id, empresaId);
      case XlinkTipoDocumento.NOTA_CREDITO:    return this.resolverNotaCredito(id, empresaId);
      case XlinkTipoDocumento.ORDEN_COMPRA:    return this.resolverOrdenCompra(id, empresaId);
    }
  }

  private async resolverFactura(id: number, empresaId: number): Promise<DocumentoParaPublicar> {
    const [f] = await this.ds.query(
      `
      SELECT f.id, f.folio, f.fecha::text AS fecha, f.total, f.estado, f."tipoPago",
             f.moneda, f."tipoCambio", f."diasCredito", f."fechaVencimiento"::text AS "fechaVencimiento",
             f."clienteId", cl.nombre AS "clienteNombre", cl."xlinkEmpresaXlinkId",
             e.numero AS "ncfOrigen", e."estadoDGII"
      FROM facturas f
      LEFT JOIN clientes cl ON cl.id = f."clienteId"
      LEFT JOIN ecf e ON e."facturaId" = f.id AND e."isActive" = true
      WHERE f.id = $1 AND f."empresaId" = $2 AND f."isActive" = true
      `,
      [id, empresaId],
    );
    if (!f) throw new BadRequestException(`Factura #${id} no existe`);
    if (f.estado === 'cancelada') throw new BadRequestException(`La factura ${f.folio} está anulada`);
    if (String(f.tipoPago).toLowerCase() !== 'credito') {
      throw new BadRequestException(`La factura ${f.folio} no es a crédito — HiCloud Xlink solo publica facturas a crédito`);
    }
    if (!ESTADOS_ECF_ACEPTABLES.includes(f.estadoDGII)) {
      throw new BadRequestException(
        `La factura ${f.folio} no tiene un e-CF aceptado por DGII (estado actual: ${f.estadoDGII ?? 'sin e-CF'}) — no se puede publicar`,
      );
    }

    const lineas = await this.ds.query(
      `
      SELECT fd."productoId", fd.descripcion, fd.cantidad::numeric, fd."precioUnitario"::numeric,
             fd."descuentoMonto"::numeric AS descuento, fd."porcentajeIva"::numeric,
             fd.subtotal::numeric AS "montoItem", fd."importeIva"::numeric AS itbis,
             p.codigo AS sku, p."unidadMedida" AS unidad
      FROM factura_detalles fd
      LEFT JOIN productos p ON p.id = fd."productoId"
      WHERE fd."facturaId" = $1
      ORDER BY fd.id
      `,
      [id],
    );

    // Encadenar xlinkPadreId: ¿esta factura nació de una Cotización que a su
    // vez vino de una Orden de Compra recibida por Xlink?
    const [cot] = await this.ds.query(
      `SELECT id FROM cotizaciones WHERE "facturaId" = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
      [id, empresaId],
    );

    return this.armarDocumento(f, lineas, {
      destinoXlinkId: f.xlinkEmpresaXlinkId,
      destinoNombreError: f.clienteNombre ? `El cliente "${f.clienteNombre}"` : 'El cliente de esta factura',
      tipoPago: f.tipoPago,
      diasCredito: f.diasCredito,
      fechaLimitePago: f.fechaVencimiento,
      entidadAuditoria: ENTIDAD_POR_TIPO[XlinkTipoDocumento.FACTURA_CREDITO],
      cotizacionGeneradaId: cot?.id,
    });
  }

  private async resolverNotaCredito(id: number, empresaId: number): Promise<DocumentoParaPublicar> {
    const [nc] = await this.ds.query(
      `
      SELECT nc.id, nc.numero AS folio, nc.fecha::text AS fecha, nc.total, nc.estado,
             nc.moneda, nc."tipoCambio", nc."clienteId", cl.nombre AS "clienteNombre", cl."xlinkEmpresaXlinkId",
             e.numero AS "ncfOrigen", e."estadoDGII"
      FROM notas_credito nc
      LEFT JOIN clientes cl ON cl.id = nc."clienteId"
      LEFT JOIN ecf e ON e."documentoOrigenId" = nc.id AND e."documentoOrigenTipo" = 'NOTA_CREDITO'
      WHERE nc.id = $1 AND nc."empresaId" = $2 AND nc."isActive" = true
      `,
      [id, empresaId],
    );
    if (!nc) throw new BadRequestException(`Nota de Crédito #${id} no existe`);
    if (nc.estado === 'anulada') throw new BadRequestException(`La NC ${nc.folio} está anulada`);
    if (!ESTADOS_ECF_ACEPTABLES.includes(nc.estadoDGII)) {
      throw new BadRequestException(
        `La NC ${nc.folio} no tiene un e-CF aceptado por DGII (estado actual: ${nc.estadoDGII ?? 'sin e-CF'}) — no se puede publicar`,
      );
    }

    const lineas = await this.ds.query(
      `
      SELECT ncd."productoId", ncd.descripcion, ncd.cantidad::numeric, ncd."precioUnitario"::numeric,
             0::numeric AS descuento, ncd."porcentajeIva"::numeric,
             ncd.subtotal::numeric AS "montoItem", ncd.iva::numeric AS itbis,
             p.codigo AS sku, ncd."unidadMedida" AS unidad
      FROM nota_credito_detalles ncd
      LEFT JOIN productos p ON p.id = ncd."productoId"
      WHERE ncd."notaCreditoId" = $1
      ORDER BY ncd.id
      `,
      [id],
    );

    return this.armarDocumento(nc, lineas, {
      destinoXlinkId: nc.xlinkEmpresaXlinkId,
      destinoNombreError: nc.clienteNombre ? `El cliente "${nc.clienteNombre}"` : 'El cliente de esta NC',
      entidadAuditoria: ENTIDAD_POR_TIPO[XlinkTipoDocumento.NOTA_CREDITO],
    });
  }

  private async resolverOrdenCompra(id: number, empresaId: number): Promise<DocumentoParaPublicar> {
    const [c] = await this.ds.query(
      `
      SELECT c.id, c.folio, c.fecha::text AS fecha, c.total, c.estado, c."tipoPago",
             c.moneda, c."tipoCambio", c."diasCredito", c."fechaVencimiento"::text AS "fechaVencimiento",
             c."proveedorId", pr.nombre AS "proveedorNombre", pr."xlinkEmpresaXlinkId"
      FROM compras c
      LEFT JOIN proveedores pr ON pr.id = c."proveedorId"
      WHERE c.id = $1 AND c."empresaId" = $2 AND c."isActive" = true
      `,
      [id, empresaId],
    );
    if (!c) throw new BadRequestException(`Orden de Compra #${id} no existe`);
    if (c.estado === 'cancelada') throw new BadRequestException(`La Compra ${c.folio} está anulada`);
    if (c.estado !== 'enviada') {
      throw new BadRequestException(`La Compra ${c.folio} debe estar en estado "enviada" para publicarse (hoy: "${c.estado}")`);
    }

    const lineas = await this.ds.query(
      `
      SELECT cd."productoId", cd.descripcion, cd.cantidad::numeric, cd."precioUnitario"::numeric,
             cd."descuentoMonto"::numeric AS descuento, cd."porcentajeItbis"::numeric AS "porcentajeIva",
             cd.subtotal::numeric AS "montoItem", cd."importeItbis"::numeric AS itbis,
             p.codigo AS sku, p."unidadMedida" AS unidad
      FROM compra_detalles cd
      LEFT JOIN productos p ON p.id = cd."productoId"
      WHERE cd."compraId" = $1
      ORDER BY cd.id
      `,
      [id],
    );

    return this.armarDocumento(c, lineas, {
      destinoXlinkId: c.xlinkEmpresaXlinkId,
      destinoNombreError: c.proveedorNombre ? `El proveedor "${c.proveedorNombre}"` : 'El proveedor de esta Compra',
      tipoPago: c.tipoPago,
      diasCredito: c.diasCredito,
      fechaLimitePago: c.fechaVencimiento,
      entidadAuditoria: ENTIDAD_POR_TIPO[XlinkTipoDocumento.ORDEN_COMPRA],
    });
  }

  private armarDocumento(
    doc: { folio: string; fecha: string; total: number; moneda: string; tipoCambio: number; ncfOrigen?: string | null },
    lineasRaw: any[],
    extra: {
      destinoXlinkId: string | null;
      destinoNombreError: string;
      tipoPago?: string;
      diasCredito?: number;
      fechaLimitePago?: string | null;
      entidadAuditoria: string;
      cotizacionGeneradaId?: number;
    },
  ): DocumentoParaPublicar {
    const lineas: LineaSnapshot[] = lineasRaw.map(l => ({
      sku: l.sku ?? null,
      nombre: l.descripcion,
      cantidad: Number(l.cantidad),
      unidad: l.unidad ?? 'UND',
      precioUnitario: Number(l.precioUnitario),
      descuento: Number(l.descuento ?? 0),
      porcentajeIva: Number(l.porcentajeIva),
      montoItem: Number(l.montoItem),
    }));

    const totalesPorTasaMap = new Map<number, { base: number; itbis: number }>();
    for (const l of lineasRaw) {
      const tasa = Number(l.porcentajeIva);
      const acc = totalesPorTasaMap.get(tasa) ?? { base: 0, itbis: 0 };
      acc.base  += Number(l.montoItem);
      acc.itbis += Number(l.itbis ?? 0);
      totalesPorTasaMap.set(tasa, acc);
    }
    const totalesConItbis = Array.from(totalesPorTasaMap.entries()).map(([porcentajeIva, v]) => ({
      porcentajeIva, base: +v.base.toFixed(2), itbis: +v.itbis.toFixed(2),
    }));

    return {
      numeroOrigen: doc.folio,
      ncfOrigen: doc.ncfOrigen ?? null,
      fechaOrigen: doc.fecha,
      totalOrigen: Number(doc.total),
      destinoXlinkId: extra.destinoXlinkId,
      destinoNombreError: extra.destinoNombreError,
      moneda: doc.moneda ?? 'DOP',
      tipoCambio: Number(doc.tipoCambio ?? 1),
      tipoPago: extra.tipoPago,
      diasCredito: extra.diasCredito,
      fechaLimitePago: extra.fechaLimitePago,
      lineas,
      totalesConItbis,
      entidadAuditoria: extra.entidadAuditoria,
      cotizacionGeneradaId: extra.cotizacionGeneradaId,
    };
  }
}
