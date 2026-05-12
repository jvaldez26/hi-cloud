import { Entity, Column, OneToMany } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { PlanDemandaLinea } from './plan-demanda-linea.entity';

export enum EstadoPlan {
  BORRADOR  = 'borrador',
  APROBADO  = 'aprobado',
  EJECUTADO = 'ejecutado',
}

@Entity('planes_demanda')
export class PlanDemanda extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ length: 7 })
  periodoDesde!: string;  // YYYY-MM

  @Column({ length: 7 })
  periodoHasta!: string;  // YYYY-MM

  @Column({ type: 'int', default: 3 })
  horizonteMeses!: number;

  @Column({ type: 'enum', enum: EstadoPlan, default: EstadoPlan.BORRADOR })
  estado!: EstadoPlan;

  @Column({ type: 'int', default: 0 })
  totalProductos!: number;

  @Column({ type: 'int', default: 0 })
  productosConAlerta!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @OneToMany(() => PlanDemandaLinea, (l) => l.plan, { cascade: true })
  lineas!: PlanDemandaLinea[];
}
