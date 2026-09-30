import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Nota de Débito de proveedor queda FUERA del MVP a propósito — no existe
 * la entidad "ND de proveedor" (lado compras) en el sistema (ver
 * notas-debito, que es exclusivamente NC/ND de VENTAS a cliente). No se
 * puede publicar ni recibir una ND por Xlink: ni el botón aparece, ni este
 * enum la incluye. Deuda anotada, no bloqueante.
 */
export enum XlinkTipoDocumento {
  FACTURA_CREDITO = 'factura_credito',
  NOTA_CREDITO    = 'nota_credito',
  ORDEN_COMPRA    = 'orden_compra',
}

export enum XlinkEstadoReceptor {
  PENDIENTE          = 'pendiente',
  PROCESADO          = 'procesado',
  PROCESADO_MANUAL   = 'procesado_manual',
  DESCARTADO         = 'descartado',
  ANULADO_EN_ORIGEN  = 'anulado_en_origen',
}

/**
 * HiCloud Xlink — el buzón de documentos entre dos empresas.
 *
 * NO extiende TenantBaseEntity y NO se decora con @TenantScoped(): esta fila
 * pertenece a DOS empresas (origen y destino), no a una. El TenantSubscriber
 * (afterLoad) solo actúa sobre filas que traen `empresaId` — al no tenerla,
 * queda fuera de su guardia automáticamente (ver tenant.subscriber.ts).
 *
 * NUNCA usar `@InjectRepository(XlinkDocumento)` fuera de
 * `xlink-documentos.repository.ts` — ese es el ÚNICO lugar donde se consulta
 * esta tabla, y exige el empresaId del CLS en cada método. Un test
 * estructural (xlink-documentos.repository.spec.ts) falla el build si algún
 * otro archivo la referencia.
 */
@Entity('xlink_documentos')
@Index(['destinoEmpresaId', 'estadoReceptor', 'publicadoEn'])
@Index(['origenEmpresaId', 'publicadoEn'])
export class XlinkDocumento extends BaseEntity {
  @Column()
  origenEmpresaId!: number;

  @Column()
  destinoEmpresaId!: number;

  @Column({ type: 'varchar', length: 20 })
  tipoDocumento!: XlinkTipoDocumento;

  @Column()
  documentoOrigenId!: number;

  @Column({ length: 20 })
  numeroOrigen!: string;

  @Column({ length: 20, nullable: true })
  ncfOrigen?: string;

  @Column({ type: 'date' })
  fechaOrigen!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  totalOrigen!: number;

  /**
   * Encabezado + líneas (sku/nombre/cantidad/unidad/precioUnitario 4 dec/
   * descuento/porcentajeIva/montoItem), totales por tasa, tipoPago,
   * fechaLimitePago, términos, moneda, tasa de cambio, RNC y nombre del
   * emisor — construido desde lo GUARDADO del documento origen, nunca
   * recalculado (ver XlinkPublicarService).
   */
  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: XlinkEstadoReceptor.PENDIENTE })
  estadoReceptor!: XlinkEstadoReceptor;

  @Column({ type: 'varchar', length: 20, nullable: true })
  documentoGeneradoTipo?: string;

  @Column({ nullable: true })
  documentoGeneradoId?: number;

  @Column({ length: 20, nullable: true })
  numeroGenerado?: string;

  /**
   * Encadena con el xlink_documentos que originó este — ej. una Factura
   * publicada que nació de una Cotización generada por una Orden de Compra
   * recibida antes. Solo se llena cuando el vínculo pedido→factura existe de
   * verdad en el emisor (ver XlinkPublicarService) — nunca se infiere a
   * ciegas.
   */
  @Column({ nullable: true })
  xlinkPadreId?: number;

  @Column()
  publicadoPorUsuarioId!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  publicadoEn!: Date;

  @Column({ nullable: true })
  procesadoPorUsuarioId?: number;

  @Column({ type: 'timestamptz', nullable: true })
  procesadoEn?: Date;

  @Column({ type: 'text', nullable: true })
  motivoDescarte?: string;
}
