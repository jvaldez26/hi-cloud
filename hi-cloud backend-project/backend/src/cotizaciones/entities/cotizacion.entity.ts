import { Entity, Column, ManyToOne, OneToMany, OneToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';
import { CotizacionDetalle } from './cotizacion-detalle.entity';
import { Factura } from '../../facturas/entities/factura.entity';

export enum CotizacionEstado {
  BORRADOR   = 'borrador',
  ENVIADA    = 'enviada',
  ACEPTADA   = 'aceptada',
  RECHAZADA  = 'rechazada',
  VENCIDA    = 'vencida',
  CONVERTIDA = 'convertida',
}

@Entity('cotizaciones')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class Cotizacion extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'date' })
  fechaVencimiento!: Date;

  @Column({ type: 'int', default: 30 })
  validezDias!: number;

  @Column({ type: 'enum', enum: CotizacionEstado, default: CotizacionEstado.BORRADOR })
  estado!: CotizacionEstado;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @OneToMany(() => CotizacionDetalle, d => d.cotizacion, { cascade: true, eager: true })
  detalles!: CotizacionDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ length: 200, nullable: true })
  condicionesPago?: string;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ length: 150, nullable: true })
  nombreVendedor?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @OneToOne(() => Factura, { nullable: true })
  @JoinColumn({ name: 'facturaId' })
  factura?: Factura;

  @Column({ nullable: true })
  facturaId?: number;
}
