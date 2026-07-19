import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Almacen } from './almacen.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('stock_almacen')
@Unique(['almacenId', 'productoId'])
export class StockAlmacen extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  almacenId!: number;

  @ManyToOne(() => Almacen, { eager: true })
  @JoinColumn({ name: 'almacenId' })
  almacen!: Almacen;

  @Column()
  productoId!: number;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stock!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stockMinimo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  stockMaximo?: number;

  @Column({ nullable: true })
  ubicacionId?: number;
}
