import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoSolicitudAjuste {
  PENDIENTE  = 'pendiente',
  APROBADA   = 'aprobada',
  RECHAZADA  = 'rechazada',
}

@TenantScoped()
@Entity('solicitudes_ajuste_inventario')
@Index(['empresaId', 'estado'])
export class SolicitudAjuste extends TenantBaseEntity {
  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadNueva!: number;

  @Column({ type: 'text' })
  motivo!: string;

  @Column({ type: 'enum', enum: EstadoSolicitudAjuste, default: EstadoSolicitudAjuste.PENDIENTE })
  estado!: EstadoSolicitudAjuste;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ nullable: true })
  adminId?: number;

  @Column({ type: 'text', nullable: true })
  motivoRechazo?: string;
}
