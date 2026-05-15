import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoPeriodo {
  ABIERTO   = 'abierto',
  CERRADO   = 'cerrado',
  BLOQUEADO = 'bloqueado',
}

export const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

@TenantScoped()
@Entity('periodos_contables')
@Index(['empresaId', 'anio', 'mes'], { unique: true })
@Index(['empresaId', 'estado'])
export class PeriodoContable extends TenantBaseEntity {
  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'int' })
  mes!: number;

  @Column({ length: 50 })
  nombre!: string;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaFin!: Date;

  @Column({ type: 'enum', enum: EstadoPeriodo, default: EstadoPeriodo.ABIERTO })
  estado!: EstadoPeriodo;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalDebitos!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalCreditos!: number;

  @Column({ type: 'int', default: 0 })
  cantidadAsientos!: number;

  @Column({ nullable: true })
  cerradoPorId?: number;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'cerradoPorId' })
  cerradoPor?: User;

  @Column({ type: 'timestamp', nullable: true })
  fechaCierre?: Date;

  @Column({ type: 'text', nullable: true })
  notasCierre?: string;
}
