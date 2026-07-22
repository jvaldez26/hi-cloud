import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Empleado } from './empleado.entity';
import { TipoContrato } from './empleado.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoContrato {
  ACTIVO   = 'activo',
  VENCIDO  = 'vencido',
  RESCINDIDO = 'rescindido',
}

@TenantScoped()
@Entity('contratos_laborales')
export class ContratoLaboral extends TenantBaseEntity {
  @ManyToOne(() => Empleado)
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column()
  empleadoId!: number;

  @Column({ length: 50 })
  numero!: string;

  @Column({ type: 'enum', enum: TipoContrato, default: TipoContrato.INDEFINIDO })
  tipo!: TipoContrato;

  @Column({ type: 'enum', enum: EstadoContrato, default: EstadoContrato.ACTIVO })
  estado!: EstadoContrato;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date', nullable: true })
  fechaFin?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  salario!: number;

  @Column({ length: 100 })
  cargo!: string;

  @Column({ length: 100, nullable: true })
  departamento?: string;

  @Column({ type: 'text', nullable: true })
  clausulas?: string;

  @Column({ length: 100, nullable: true })
  lugarTrabajo?: string;

  @Column({ type: 'int', nullable: true })
  horasSemana?: number;

  /** 'pendiente_firma' | 'firmado' */
  @Column({ length: 30, default: 'pendiente_firma' })
  estadoFirma: string = 'pendiente_firma';

  @Column({ type: 'timestamp', nullable: true })
  firmadoEn?: Date;
}
