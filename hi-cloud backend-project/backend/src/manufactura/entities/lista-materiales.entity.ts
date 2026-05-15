import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('listas_materiales')
export class ListaMateriales extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  // Producto que se fabrica
  @Column()
  productoFinalId!: number;

  // Cuántas unidades del producto final produce esta fórmula
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  rendimiento!: number;

  @Column({ length: 20, default: 'PZA' })
  unidadRendimiento!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  costoPorUnidad?: number;

  @Column({ default: true })
  activa!: boolean;
}
