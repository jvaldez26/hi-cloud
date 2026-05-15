import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { ReglaDistribucionLinea } from './regla-distribucion-linea.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum PeriodicitadRegla {
  MANUAL    = 'manual',
  MENSUAL   = 'mensual',
  TRIMESTRAL = 'trimestral',
  ANUAL     = 'anual',
}

@TenantScoped()
@Entity('reglas_distribucion')
@Index(['empresaId', 'isActive'])
export class ReglaDistribucion extends TenantBaseEntity {
  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  // Cuenta origen cuyo saldo se distribuye
  @Column()
  cuentaOrigenId!: number;

  @Column({ length: 200, nullable: true })
  cuentaOrigenNombre?: string;

  @Column({ type: 'enum', enum: PeriodicitadRegla, default: PeriodicitadRegla.MANUAL })
  periodicidad!: PeriodicitadRegla;

  @Column({ default: true })
  activa!: boolean;

  // Total de ejecuciones realizadas
  @Column({ type: 'int', default: 0 })
  vecesEjecutada!: number;

  @Column({ type: 'date', nullable: true })
  ultimaEjecucion?: Date;

  @OneToMany(() => ReglaDistribucionLinea, (l) => l.regla, { cascade: true, eager: true })
  lineas!: ReglaDistribucionLinea[];
}
