import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoDescuento {
  PORCENTAJE = 'porcentaje',
  MONTO_FIJO = 'monto_fijo',
}

export enum CondicionDescuento {
  SIEMPRE       = 'siempre',
  CATEGORIA     = 'categoria',
  PRODUCTO      = 'producto',
  CANTIDAD_MIN  = 'cantidad_min',
  MONTO_MIN     = 'monto_min',
  FECHA         = 'fecha',
}

@TenantScoped()
@Entity('reglas_descuento')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'activo'])
export class ReglaDescuento extends TenantBaseEntity {
  @Column({ length: 150 })
  nombre!: string;

  @Column({ type: 'enum', enum: TipoDescuento, default: TipoDescuento.PORCENTAJE })
  tipo!: TipoDescuento;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ type: 'enum', enum: CondicionDescuento, default: CondicionDescuento.SIEMPRE })
  condicion!: CondicionDescuento;

  @Column({ length: 300, nullable: true })
  condicionValor?: string;

  @Column({ type: 'date', nullable: true })
  fechaDesde?: Date;

  @Column({ type: 'date', nullable: true })
  fechaHasta?: Date;

  @Column({ type: 'int', default: 1 })
  prioridad!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
