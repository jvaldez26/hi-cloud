import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ActivoFijo } from '../../activos-fijos/entities/activo-fijo.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoMantenimiento {
  PREVENTIVO  = 'preventivo',
  CORRECTIVO  = 'correctivo',
  PREDICTIVO  = 'predictivo',
}

export enum PrioridadMantenimiento {
  BAJA    = 'baja',
  MEDIA   = 'media',
  ALTA    = 'alta',
  CRITICA = 'critica',
}

export enum EstadoMantenimiento {
  PROGRAMADO  = 'programado',
  EN_PROCESO  = 'en_proceso',
  COMPLETADO  = 'completado',
  CANCELADO   = 'cancelado',
  VENCIDO     = 'vencido',
}

@TenantScoped()
@Entity('ordenes_mantenimiento')
export class OrdenMantenimiento extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  numero!: string;

  @Column()
  activoId!: number;

  @ManyToOne(() => ActivoFijo, { eager: true })
  @JoinColumn({ name: 'activoId' })
  activo!: ActivoFijo;

  @Column({ type: 'enum', enum: TipoMantenimiento })
  tipo!: TipoMantenimiento;

  @Column({ type: 'enum', enum: PrioridadMantenimiento, default: PrioridadMantenimiento.MEDIA })
  prioridad!: PrioridadMantenimiento;

  @Column({ type: 'enum', enum: EstadoMantenimiento, default: EstadoMantenimiento.PROGRAMADO })
  estado!: EstadoMantenimiento;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'date' })
  fechaProgramada!: Date;

  @Column({ type: 'date', nullable: true })
  fechaRealizada?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  costoEstimado?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  costoReal?: number;

  @Column({ length: 150, nullable: true })
  tecnico?: string;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;

  @Column({ type: 'jsonb', nullable: true })
  repuestosUsados?: { descripcion: string; costo: number }[];

  @Column({ nullable: true })
  usuarioId?: number;
}
