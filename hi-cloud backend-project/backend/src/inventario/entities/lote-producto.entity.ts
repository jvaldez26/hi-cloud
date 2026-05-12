import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Producto } from '../../productos/entities/producto.entity';

export enum EstadoLote {
  ACTIVO   = 'activo',
  AGOTADO  = 'agotado',
  VENCIDO  = 'vencido',
  CUARENTENA = 'cuarentena',
}

@Entity('lotes_producto')
@Index(['empresaId', 'productoId'])
@Index(['empresaId', 'numeroLote'])
export class LoteProducto extends TenantBaseEntity {
  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ nullable: true })
  almacenId?: number;

  @Column({ length: 100 })
  numeroLote!: string;

  @Column({ type: 'date', nullable: true })
  fechaFabricacion?: Date;

  @Column({ type: 'date', nullable: true })
  fechaVencimiento?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadInicial!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadDisponible!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costoUnitario!: number;

  @Column({ type: 'enum', enum: EstadoLote, default: EstadoLote.ACTIVO })
  estado!: EstadoLote;

  @Column({ length: 200, nullable: true })
  proveedor?: string;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
