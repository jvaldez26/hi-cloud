import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoSerial {
  DISPONIBLE  = 'disponible',
  VENDIDO     = 'vendido',
  DEVUELTO    = 'devuelto',
  DEFECTUOSO  = 'defectuoso',
  EN_GARANTIA = 'en_garantia',
  DADO_BAJA   = 'dado_baja',
}

@TenantScoped()
@Entity('seriales_producto')
@Index(['empresaId', 'productoId'])
@Index(['empresaId', 'numeroSerie'])
export class SerialProducto extends TenantBaseEntity {
  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ length: 100 })
  numeroSerie!: string;

  @Column({ type: 'enum', enum: EstadoSerial, default: EstadoSerial.DISPONIBLE })
  estado!: EstadoSerial;

  @Column({ nullable: true })
  loteId?: number;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ type: 'date', nullable: true })
  fechaVenta?: Date;

  @Column({ type: 'date', nullable: true })
  fechaVencimientoGarantia?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costoUnitario!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
