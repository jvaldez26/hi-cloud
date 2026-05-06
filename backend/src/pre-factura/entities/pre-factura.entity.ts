import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { PreFacturaDetalle } from './pre-factura-detalle.entity';

export enum EstadoPreFactura {
  BORRADOR    = 'borrador',
  ENVIADA     = 'enviada',
  APROBADA    = 'aprobada',
  RECHAZADA   = 'rechazada',
  CONVERTIDA  = 'convertida',
  VENCIDA     = 'vencida',
}

@Entity('pre_facturas')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'clienteId'])
export class PreFactura extends TenantBaseEntity {
  @Column({ length: 20 })
  folio!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'date', nullable: true })
  fechaVencimiento?: Date;

  @Column({ type: 'enum', enum: EstadoPreFactura, default: EstadoPreFactura.BORRADOR })
  estado!: EstadoPreFactura;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column()
  usuarioId!: number;

  @OneToMany(() => PreFacturaDetalle, d => d.preFactura, { cascade: true, eager: true })
  detalles!: PreFacturaDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ length: 10, nullable: true, default: 'E32' })
  tipoNcf?: string;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ nullable: true })
  conduceId?: number;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ length: 150, nullable: true })
  nombreVendedor?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ type: 'text', nullable: true })
  motivoRechazo?: string;
}
