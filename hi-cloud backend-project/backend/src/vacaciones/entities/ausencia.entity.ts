import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Empleado } from '../../nomina/entities/empleado.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoAusencia {
  ENFERMEDAD       = 'enfermedad',
  PERSONAL         = 'personal',
  TARDIA           = 'tardia',
  SIN_AVISO        = 'sin_aviso',
  MATERNIDAD       = 'maternidad',
  PATERNIDAD       = 'paternidad',
  LUTO             = 'luto',
  LICENCIA_ESPECIAL= 'licencia_especial',
}

@TenantScoped()
@Entity('ausencias')
export class Ausencia extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  empleadoId!: number;

  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: TipoAusencia })
  tipo!: TipoAusencia;

  @Column({ default: false })
  justificada!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1 })
  dias!: number;

  @Column({ nullable: true })
  registradoPor?: number;
}
