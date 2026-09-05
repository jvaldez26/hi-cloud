import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { NotaCreditoDetalle } from './nota-credito-detalle.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoNotaCredito {
  BORRADOR  = 'borrador',
  EMITIDA   = 'emitida',
  ANULADA   = 'anulada',
  /** DGII rechazó y la secuencia fue quemada. Se debe emitir una NC nueva. */
  RECHAZADA = 'rechazada',
}

export enum MotivoNotaCredito {
  DEVOLUCION          = 'devolucion',
  DESCUENTO_OTORGADO  = 'descuento_otorgado',
  ERROR_PRECIO        = 'error_precio',
  ERROR_CANTIDAD      = 'error_cantidad',
  ANULACION_FACTURA   = 'anulacion_factura',
  OTRO                = 'otro',
}

@TenantScoped()
@Entity('notas_credito')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'clienteId'])
export class NotaCredito extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ length: 10, default: 'E34' })
  tipoNcf!: string;

  @Column({ nullable: true })
  facturaOriginalId?: number;

  @Column({ length: 20, nullable: true })
  facturaOriginalFolio?: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column()
  usuarioId!: number;

  @Column({ type: 'enum', enum: MotivoNotaCredito, default: MotivoNotaCredito.DEVOLUCION })
  motivo!: MotivoNotaCredito;

  @Column({ type: 'text', nullable: true })
  descripcionMotivo?: string;

  @OneToMany(() => NotaCreditoDetalle, d => d.notaCredito, { cascade: true, eager: true })
  detalles!: NotaCreditoDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'enum', enum: EstadoNotaCredito, default: EstadoNotaCredito.BORRADOR })
  estado!: EstadoNotaCredito;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ length: 150, nullable: true })
  nombreVendedor?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  /** Moneda heredada de la factura original (DOP, USD, etc.) */
  @Column({ length: 3, default: 'DOP' })
  moneda!: string;

  /** Tasa de cambio al momento de la factura original */
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio!: number;

  /** true después de que los efectos sobre la factura original ya se aplicaron (DGII aceptó) */
  @Column({ default: false })
  efectosAplicados!: boolean;

  /**
   * Código de modificación DGII elegido al crear la nota (1=Anulación total,
   * 2=Corrección de texto, 3=Corrección de montos, 4=Reemplazo de contingencia,
   * 5=Referencia a Factura de Consumo). Se fija en `crear()` y el endpoint de
   * emisión lo lee de aquí — no se vuelve a pedir ni se acepta del body.
   */
  @Column({ length: 1, nullable: true })
  codigoModificacion?: string;
}
