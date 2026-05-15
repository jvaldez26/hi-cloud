import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoCentroCosto {
  INGRESO = 'ingreso',
  EGRESO  = 'egreso',
  AMBOS   = 'ambos',
}

@TenantScoped()
@Entity('centros_costo')
export class CentroCosto extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  codigo!: string;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: TipoCentroCosto, default: TipoCentroCosto.AMBOS })
  tipo!: TipoCentroCosto;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  presupuesto!: number;

  @Column({ nullable: true })
  parentId?: number;
}
