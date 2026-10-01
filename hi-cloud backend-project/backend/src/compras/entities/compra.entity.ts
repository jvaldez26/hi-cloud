import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { CompraDetalle } from './compra-detalle.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum CompraEstado {
  BORRADOR         = 'borrador',
  ENVIADA          = 'enviada',
  RECIBIDA         = 'recibida',
  RECIBIDA_PARCIAL = 'recibida_parcial',
  PAGADA           = 'pagada',
  CANCELADA        = 'cancelada',
}

@TenantScoped()
@Entity('compras')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class Compra extends TenantBaseEntity {
  @Column({ length: 20 })
  folio!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: CompraEstado, default: CompraEstado.BORRADOR })
  estado!: CompraEstado;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedorId' })
  proveedor!: Proveedor;

  @Column()
  proveedorId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuarioId' })
  usuario!: User;

  @Column()
  usuarioId!: number;

  @OneToMany(() => CompraDetalle, (d) => d.compra, { cascade: true })
  detalles!: CompraDetalle[];

  /**
   * Base gravable = Σ (precioUnitario × cantidad − descuentoMonto) por línea.
   * Ya viene NETA de descuento — con descuentoTotal = 0 es idéntica a la
   * suma bruta de siempre, así que las OC sin descuento no cambian.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  /**
   * Σ compra_detalles.descuentoMonto + descuentoGeneralMonto — denormalizado
   * para el pie de la orden y el PDF (compras-pdf.service.ts reconstruye el
   * bruto como subtotal + descuentoTotal): el descuento general se suma aquí
   * para que ambos consumidores existentes reflejen el descuento combinado
   * sin cambiar de código.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuentoTotal!: number;

  /**
   * Descuento GENERAL (a nivel de documento completo, no por línea) — se
   * repite después del reparto proporcional por línea (mismo motor que
   * factura/cotización/pro-forma/pre-factura, ver
   * common/calculo/descuento-documento.ts). tipo/valor son la entrada cruda
   * del formulario (para poder reeditarla); monto es lo que efectivamente se
   * aplicó, ya en base imponible.
   */
  @Column({ length: 20, nullable: true })
  descuentoGeneralTipo?: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  descuentoGeneralValor?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuentoGeneralMonto!: number;

  /**
   * 'subtotal' (default, NULL = comportamiento histórico) o 'total' — sobre
   * qué espacio se interpreta descuentoGeneralValor. Ver
   * common/calculo/descuento-documento.ts para el porqué del reparto
   * distinto cuando es 'total' (tasas de ITBIS mixtas por línea).
   */
  @Column({ length: 20, nullable: true })
  descuentoGeneralAplicarSobre?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ length: 50, nullable: true })
  numeroFacturaProveedor?: string;

  @Column({ nullable: true })
  sucursalId?: number;

  /** Almacén destino donde se recibirá la mercancía */
  @Column({ nullable: true })
  almacenId?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // ── Campos DGII 606 ────────────────────────────────────────────────────────
  /** Tipo de bienes/servicios según tabla DGII (01-11). Default: '09' */
  @Column({ length: 2, nullable: true, default: '09' })
  tipoBienes?: string;

  /** Forma de pago según códigos DGII (01-07). Default: '04' (crédito) */
  @Column({ length: 2, nullable: true, default: '04' })
  formaPago?: string;

  /**
   * Selector de cuenta contable (2026-09-19) — la misma factura puede ser
   * gasto, activo fijo o inventario según lo que realmente se compró; el
   * asiento automático siempre iba a Inventario (COD.INVENTARIO) sin
   * importar esto. NULL = usa el default del motor (Inventario), igual que
   * siempre — el contador solo la toca cuando el criterio real lo pide.
   * Código de cuenta validado por el motor mismo al generar el asiento
   * (cuenta no encontrada / no permite movimientos), no aquí.
   */
  @Column({ length: 20, nullable: true })
  cuentaDestino?: string;

  /** Fecha efectiva de pago (puede diferir de fecha del comprobante) */
  @Column({ type: 'date', nullable: true })
  fechaPago?: Date;

  /** Tipo de pago: contado (no genera CxP) o credito (genera CxP automáticamente) */
  @Column({ length: 10, nullable: true, default: 'credito' })
  tipoPago?: string;

  /** Días de crédito (solo aplica si tipoPago = 'credito') */
  @Column({ type: 'int', nullable: true, default: 30 })
  diasCredito?: number;

  /** Fecha de vencimiento del crédito (fecha + diasCredito) */
  @Column({ type: 'date', nullable: true })
  fechaVencimiento?: Date;

  /** Moneda de la compra (DOP, USD, EUR) */
  @Column({ length: 3, nullable: true, default: 'DOP' })
  moneda?: string;

  /** Tasa de cambio al momento de registrar la compra */
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, default: 1 })
  tipoCambio?: number;

  // ── Retenciones E41 (solo proveedores informales) ──────────────────

  @Column({ default: false })
  retieneItbis!: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  porcentajeRetencionItbis!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoRetencionItbis!: number;

  @Column({ default: false })
  retieneIsr!: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  porcentajeRetencionIsr!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoRetencionIsr!: number;

  /** Total - retenciones (lo que realmente se paga al proveedor) */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  netoPagar!: number;

  // ── Conversión de moneda (2026-09-20) ───────────────────────────────────
  // subtotal/itbis/total/montoRetencion*/netoPagar arriba SIGUEN en la
  // moneda ORIGINAL de la compra — hacen falta para conciliar con la
  // factura del proveedor, nunca se sobrescriben. Estas son su equivalente
  // en DOP (= original × tipoCambio; idénticas al original cuando
  // moneda='DOP') y son las que alimentan AVCO y el asiento contable desde
  // este commit. NULL en compras históricas creadas antes de este commit —
  // el código que las consume cae a la columna original cuando es NULL.

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  subtotalDOP?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  itbisDOP?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalDOP?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  montoRetencionItbisDOP?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  montoRetencionIsrDOP?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  netoPagarDOP?: number;

  // ── Idempotencia (recuperación de borradores — Fase 2) ────────────────────
  //
  // Clave que el FRONTEND genera una sola vez por formulario abierto (UUID).
  // Si la misma clave llega dos veces — reintento tras restaurar un borrador
  // cuyo guardado falló la vez pasada — create() debe devolver ESTA compra en
  // vez de crear una segunda. Ver ComprasService.create() y el índice único
  // (empresaId, claveIdempotencia), que es quien realmente cierra la carrera
  // si dos peticiones caen en el mismo instante. Mismo patrón que
  // Factura.claveIdempotencia.
  @Column({ length: 36, nullable: true, default: null })
  claveIdempotencia?: string;
}
