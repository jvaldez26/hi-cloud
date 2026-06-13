import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoMovimiento {
  ENTRADA    = 'entrada',
  SALIDA     = 'salida',
  AJUSTE     = 'ajuste',
  DEVOLUCION = 'devolucion',
  SALIDA_TRANSFERENCIA      = 'salida_transferencia',
  ENTRADA_TRANSFERENCIA     = 'entrada_transferencia',
  CANCELACION_TRANSFERENCIA = 'cancelacion_transferencia',
}

@TenantScoped()
@Entity('movimientos_inventario')
@Index(['empresaId', 'productoId'])
@Index(['empresaId', 'createdAt'])
export class Movimiento extends TenantBaseEntity {
  @Column({ type: 'enum', enum: TipoMovimiento })
  tipo!: TipoMovimiento;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadAnterior!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadNueva!: number;

  @Column({ type: 'text', nullable: true })
  motivo?: string;

  @Column({ length: 50, nullable: true })
  referencia?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ nullable: true })
  almacenId?: number;
}
