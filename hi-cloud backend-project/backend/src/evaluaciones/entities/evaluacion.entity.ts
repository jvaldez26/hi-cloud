import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Empleado } from '../../nomina/entities/empleado.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoEvaluacion {
  BORRADOR    = 'borrador',
  EN_REVISION = 'en_revision',
  COMPLETADA  = 'completada',
}

export enum PeriodoEvaluacion {
  TRIMESTRAL = 'trimestral',
  SEMESTRAL  = 'semestral',
  ANUAL      = 'anual',
}

@TenantScoped()
@Entity('evaluaciones_empleado')
export class EvaluacionEmpleado extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  empleadoId!: number;

  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column()
  evaluadorId!: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'evaluadorId' })
  evaluador!: User;

  @Column({ type: 'enum', enum: PeriodoEvaluacion, default: PeriodoEvaluacion.SEMESTRAL })
  periodo!: PeriodoEvaluacion;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'int', default: 1 })
  semestre!: number; // 1 o 2 para semestral; trimestre 1-4; 1 para anual

  @Column({ type: 'enum', enum: EstadoEvaluacion, default: EstadoEvaluacion.BORRADOR })
  estado!: EstadoEvaluacion;

  // Criterios de evaluación — JSON con puntajes
  @Column({ type: 'jsonb', default: '{}' })
  criterios!: Record<string, number>; // { "puntualidad": 4, "calidad": 5, ... }

  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  calificacionGeneral?: number; // calculada del promedio de criterios

  @Column({ type: 'text', nullable: true })
  fortalezas?: string;

  @Column({ type: 'text', nullable: true })
  areasImprovement?: string;

  @Column({ type: 'text', nullable: true })
  comentarios?: string;

  @Column({ type: 'text', nullable: true })
  comentariosEmpleado?: string;
}
