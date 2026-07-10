import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { FacturaDetalle } from './factura-detalle.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum FacturaEstado {
  BORRADOR  = 'borrador',
  EMITIDA   = 'emitida',
  PAGADA    = 'pagada',
  CANCELADA = 'cancelada',
}

@TenantScoped()
@Entity('facturas')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'createdAt'])
export class Factura extends TenantBaseEntity {
  @Column({ length: 20 })
  folio!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: FacturaEstado, default: FacturaEstado.BORRADOR })
  estado!: FacturaEstado;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'clienteId' })
  cliente?: Cliente;

  @Column({ nullable: true })
  clienteId?: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuarioId' })
  usuario!: User;

  @Column()
  usuarioId!: number;

  @OneToMany(() => FacturaDetalle, (d) => d.factura, { cascade: true })
  detalles!: FacturaDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ nullable: true })
  ecfId?: number;

  @Column({ length: 10, nullable: true, default: 'E32' })
  tipoNcf?: string;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ length: 150, nullable: true })
  nombreVendedor?: string;

  // ── Multi-moneda ──────────────────────────────────────────────────────────────
  @Column({ length: 3, default: 'DOP' })
  moneda!: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalOriginal?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // ── Factura recurrente origen ─────────────────────────────────────────────
  /** ID de la FacturaRecurrente que generó esta factura (null si fue manual) */
  @Column({ nullable: true })
  facturaRecurrenteId?: number;

  // ── Crédito ───────────────────────────────────────────────────────────────
  @Column({ length: 10, default: 'CONTADO' })
  tipoPago!: string;             // 'CONTADO' | 'CREDITO'

  @Column({ type: 'int', default: 0 })
  diasCredito!: number;

  @Column({ type: 'date', nullable: true })
  fechaVencimiento?: Date;

  // ── Retenciones E31 (agente de retención) ─────────────────────────────────
  @Column({ default: false })
  aplicaRetenciones!: boolean;

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

  /** total - retenciones (lo que realmente se cobra / genera CxC) */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  netoCobrar!: number;

  /** true mientras una NC de anulación total (código 1) espera confirmación de DGII */
  @Column({ default: false })
  anulacionPendiente!: boolean;

  // ── Descuento general ─────────────────────────────────────────────────────
  /** 'monto' = RD$ fijo sobre subtotal | 'porcentaje' = % sobre subtotal */
  @Column({ length: 10, nullable: true, default: null })
  descuentoGeneralTipo?: string;   // 'monto' | 'porcentaje'

  /** Valor del descuento general: importe RD$ o porcentaje (0-100) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  descuentoGeneralValor?: number;

  // ── Comprador (cuando se ingresa RNC/cédula sin seleccionar cliente) ────────
  /** RNC o cédula del comprador capturado manualmente en el formulario */
  @Column({ length: 11, nullable: true, default: null })
  rncComprador?: string;

  // ── Orden de Compra ───────────────────────────────────────────────────────
  @Column({ length: 100, nullable: true, default: null })
  ordenCompraNumero?: string;

  @Column({ type: 'text', nullable: true, default: null })
  ordenCompraUrl?: string;

  // ── Formas de pago (múltiples métodos) ───────────────────────────────────
  // [{ tipo: 1, monto: 5000.00, referencia?: 'ref' }]
  // Tipos DGII: 1=Efectivo 2=Cheque/Transfer 3=Tarjeta 4=Crédito 5=Permuta 6=Nota Crédito
  @Column({ type: 'jsonb', nullable: true, default: null })
  formasPago?: { tipo: number; monto: number; referencia?: string }[];
}
