import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('productos')
@Index(['empresaId', 'isActive'])
export class Producto extends TenantBaseEntity {
  @Column({ length: 10, default: 'producto' })
  tipo!: string;  // 'producto' | 'servicio'

  @Column({ length: 30 })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ length: 20, default: 'PZA' })
  unidadMedida!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precio!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stock!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stockMinimo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  stockMaximo?: number;

  @Column({ length: 100, nullable: true })
  categoria?: string;

  @Column({ length: 10, nullable: true })
  claveProductoSat?: string;

  @Column({ length: 10, nullable: true })
  claveUnidadSat?: string;

  @Column({ type: 'text', nullable: true })
  imagenUrl?: string;

  // Costo promedio ponderado (AVCO) — se actualiza al recibir mercancía
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  costoPromedio!: number;
}
