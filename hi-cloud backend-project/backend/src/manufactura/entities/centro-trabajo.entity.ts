import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoCentroTrabajo {
  MAQUINA       = 'maquina',
  MANUAL        = 'manual',
  SUBCONTRATADO = 'subcontratado',
}

@TenantScoped()
@Entity('centros_trabajo')
@Index(['empresaId', 'isActive'])
export class CentroTrabajo extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 200, nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: TipoCentroTrabajo, default: TipoCentroTrabajo.MANUAL })
  tipo!: TipoCentroTrabajo;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 8 })
  capacidadHorasDia!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoHora!: number;

  @Column({ length: 100, nullable: true })
  responsable?: string;

  @Column({ length: 200, nullable: true })
  ubicacion?: string;

  @Column({ default: true })
  activo!: boolean;
}
