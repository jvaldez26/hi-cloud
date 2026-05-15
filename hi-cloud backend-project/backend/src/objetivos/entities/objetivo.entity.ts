import { Entity, Column, OneToMany } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum NivelObjetivo {
  EMPRESA      = 'empresa',
  DEPARTAMENTO = 'departamento',
  INDIVIDUAL   = 'individual',
}

export enum EstadoObjetivo {
  ACTIVO    = 'activo',
  EN_RIESGO = 'en_riesgo',
  CUMPLIDO  = 'cumplido',
  CANCELADO = 'cancelado',
}

export enum PeriodoObjetivo {
  Q1 = 'Q1', Q2 = 'Q2', Q3 = 'Q3', Q4 = 'Q4',
  ANUAL = 'anual',
}

@TenantScoped()
@Entity('objetivos')
export class Objetivo extends TenantBaseEntity {
  @Column({ length: 300 })
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: NivelObjetivo, default: NivelObjetivo.EMPRESA })
  nivel!: NivelObjetivo;

  @Column({ type: 'enum', enum: EstadoObjetivo, default: EstadoObjetivo.ACTIVO })
  estado!: EstadoObjetivo;

  @Column({ type: 'enum', enum: PeriodoObjetivo, default: PeriodoObjetivo.ANUAL })
  periodo!: PeriodoObjetivo;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'int', default: 0 })
  progresoGlobal!: number; // 0–100 calculado del promedio de KRs

  @Column({ length: 100, nullable: true })
  propietario?: string;

  @Column({ nullable: true })
  propietarioId?: number;

  @Column({ nullable: true })
  parentId?: number;
}
