import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Empleado } from '../../nomina/entities/empleado.entity';

export enum EstadoSolicitud {
  PENDIENTE = 'pendiente',
  APROBADA  = 'aprobada',
  RECHAZADA = 'rechazada',
  CANCELADA = 'cancelada',
}

@Entity('solicitudes_vacacion')
export class SolicitudVacacion extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  empleadoId!: number;

  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaFin!: Date;

  @Column({ type: 'int' })
  diasSolicitados!: number;

  @Column({ type: 'enum', enum: EstadoSolicitud, default: EstadoSolicitud.PENDIENTE })
  estado!: EstadoSolicitud;

  @Column({ type: 'text', nullable: true })
  motivo?: string;

  @Column({ type: 'text', nullable: true })
  observacionAprobador?: string;

  @Column({ nullable: true })
  aprobadorId?: number;

  @Column({ type: 'timestamp', nullable: true })
  fechaRespuesta?: Date;

  @Column({ default: new Date().getFullYear() })
  anio!: number;
}
