import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TipoNotificacion } from '../notificaciones/entities/notificacion-enviada.entity';
import { XlinkService } from './xlink.service';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkEstadoReceptor, XlinkTipoDocumento } from './entities/xlink-documento.entity';
import { PublicarXlinkDto, PublicarXlinkResultadoItem } from './dto/publicar-xlink.dto';
import { reportServiceError } from '../common/observability/sentry';

/** e-CF aceptado por DGII, con o sin observaciones — mismo criterio que
 *  notas-credito.service.ts (getSaldoDisponible) y emitir-ecf.use-case. */
export const ESTADOS_ECF_ACEPTABLES = ['aceptado', 'observado'];

/** Centavos exactos (entero) — compara montos sin el error de redondeo binario de JS (0.1+0.2 !== 0.3). */
function aCentavos(n: number): number {
  return Math.round(n * 100);
}

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
  /** Factura ORIGEN (id propio del emisor) que esta NC modifica — Fase 4 la usa para encontrar la Compra correspondiente al recibir. */
  facturaOriginalId?: number;
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
    private realtimeService: RealtimeService,
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
        facturaOriginalId: doc.facturaOriginalId ?? null,
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

    // Badge de "Por Procesar" en vivo para el RECEPTOR — mismo WebSocket que
    // ya usa el resto de la app (useRealtime.ts, ENTITY_KEYS['xlink']).
    // Antes el badge solo se refrescaba al invalidar la query a mano desde
    // dentro de XlinkPage, así que un documento nuevo no aparecía hasta
    // recargar o tocar algo en Xlink (bug real, auditoría 2026-10-03, Fase 1g).
    this.realtimeService.notify(contraparte.id, 'xlink', 'created', creado.id);
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

  /**
   * Cuadre EXACTO al centavo, sin tolerancia (Fase 2f, auditoría HiCloud
   * Xlink 2026-10-03) — antes toleraba hasta 2 centavos de diferencia "por
   * redondeo", lo que podía dejar pasar un documento genuinamente mal
   * armado. Los montos se toman del snapshot (doc.lineas/totalesConItbis)
   * TAL CUAL — nunca se recalculan aquí (cantidad×precio−descuento podría
   * no coincidir con cómo el documento original redondeó internamente,
   * dando un falso "no cuadra" sobre un documento que sí está bien).
   *
   * Si el total no cuadra, el error no se queda en "no cuadra" genérico:
   * lista cada línea (nombre + monto) y cada grupo por tasa de ITBIS, para
   * que se pueda ver a simple vista cuál es la que no encaja, y dice la
   * diferencia exacta en centavos.
   */
  private verificarCuadre(doc: DocumentoParaPublicar): void {
    const sumaBase  = doc.totalesConItbis.reduce((acc, t) => acc + t.base, 0);
    const sumaItbis = doc.totalesConItbis.reduce((acc, t) => acc + t.itbis, 0);
    const sumaTotal = aCentavos(sumaBase + sumaItbis);
    const totalOrigen = aCentavos(Number(doc.totalOrigen));

    if (sumaTotal !== totalOrigen) {
      const porLinea = doc.lineas
        .map(l => `${l.nombre}${l.sku ? ` (${l.sku})` : ''}: ${l.montoItem.toFixed(2)}`)
        .join('; ');
      const porTasa = doc.totalesConItbis
        .map(t => `${t.porcentajeIva}%: base ${t.base.toFixed(2)} + ITBIS ${t.itbis.toFixed(2)}`)
        .join('; ');
      throw new BadRequestException(
        `El documento no cuadra: la suma de líneas (${(sumaTotal / 100).toFixed(2)}) no coincide con el total ` +
        `guardado (${(totalOrigen / 100).toFixed(2)}) — diferencia de ${(Math.abs(sumaTotal - totalOrigen) / 100).toFixed(2)}. ` +
        `Líneas: ${porLinea}. Por tasa: ${porTasa}. No se publicó.`,
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

  /**
   * CAPA 6 del CI (check-tenant-empresaid-filter.js) exige que el JOIN contra
   * `productos` filtre empresaId en la misma consulta — aquí va en el ON, no
   * en el WHERE, para no convertir el LEFT JOIN en INNER y perder líneas sin
   * producto (servicios, líneas libres). Eso significa que una línea con
   * productoId de OTRA empresa también deja p.* en NULL, indistinguible de
   * "sin producto" — por eso se selecciona `p.id AS "productoEmpresaId"` y se
   * verifica aquí: si vino productoId pero NO hubo match, es corrupción de
   * datos (nunca debería pasar en operación normal) y se aborta sin publicar.
   */
  private assertProductosPropios(lineasRaw: any[], numeroOrigen: string, empresaId: number): void {
    for (let i = 0; i < lineasRaw.length; i++) {
      const l = lineasRaw[i];
      if (l.productoId != null && l.productoEmpresaId == null) {
        const error = new Error(
          `HiCloud Xlink: ${numeroOrigen} línea ${i + 1} referencia productoId=${l.productoId}, ` +
          `que no pertenece a la empresa #${empresaId} — no se publica nada.`,
        );
        reportServiceError(error, 'xlink.publicar.producto_cross_tenant', {
          empresaId, numeroOrigen, productoId: l.productoId, linea: i + 1,
        });
        throw new BadRequestException(
          `La línea ${i + 1} de ${numeroOrigen} referencia un producto que no pertenece a la empresa`,
        );
      }
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
             p.codigo AS sku, p."unidadMedida" AS unidad, p.id AS "productoEmpresaId"
      FROM factura_detalles fd
      LEFT JOIN productos p ON p.id = fd."productoId" AND p."empresaId" = $2
      WHERE fd."facturaId" = $1
      ORDER BY fd.id
      `,
      [id, empresaId],
    );
    this.assertProductosPropios(lineas, f.folio, empresaId);

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
             nc."facturaOriginalId",
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
             p.codigo AS sku, ncd."unidadMedida" AS unidad, p.id AS "productoEmpresaId"
      FROM nota_credito_detalles ncd
      LEFT JOIN productos p ON p.id = ncd."productoId" AND p."empresaId" = $2
      WHERE ncd."notaCreditoId" = $1
      ORDER BY ncd.id
      `,
      [id, empresaId],
    );
    this.assertProductosPropios(lineas, nc.folio, empresaId);

    return this.armarDocumento(nc, lineas, {
      destinoXlinkId: nc.xlinkEmpresaXlinkId,
      destinoNombreError: nc.clienteNombre ? `El cliente "${nc.clienteNombre}"` : 'El cliente de esta NC',
      entidadAuditoria: ENTIDAD_POR_TIPO[XlinkTipoDocumento.NOTA_CREDITO],
      facturaOriginalId: nc.facturaOriginalId ?? undefined,
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
    // La documentación de Xlink siempre dijo que la OC necesita "término de
    // pago" para publicarse — tipoPago es NULLABLE en compras (create-compra.dto.ts),
    // así que esto nunca se validó de verdad. Sin tipoPago, el receptor no
    // sabe si la cotización que generará es a crédito o contado.
    if (!c.tipoPago) {
      throw new BadRequestException(
        `La Compra ${c.folio} no tiene término de pago (contado/crédito) — no se puede publicar sin eso.`,
      );
    }

    const lineas = await this.ds.query(
      `
      SELECT cd."productoId", cd.descripcion, cd.cantidad::numeric, cd."precioUnitario"::numeric,
             cd."descuentoMonto"::numeric AS descuento, cd."porcentajeItbis"::numeric AS "porcentajeIva",
             cd.subtotal::numeric AS "montoItem", cd."importeItbis"::numeric AS itbis,
             p.codigo AS sku, p."unidadMedida" AS unidad, p.id AS "productoEmpresaId"
      FROM compra_detalles cd
      LEFT JOIN productos p ON p.id = cd."productoId" AND p."empresaId" = $2
      WHERE cd."compraId" = $1
      ORDER BY cd.id
      `,
      [id, empresaId],
    );
    this.assertProductosPropios(lineas, c.folio, empresaId);

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
      facturaOriginalId?: number;
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
      facturaOriginalId: extra.facturaOriginalId,
    };
  }
}
