import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Proyecto } from './proyecto.entity';
import { User } from '../../users/users.entity';

export enum EstadoTarea {
  PENDIENTE    = 'pendiente',
  EN_PROGRESO  = 'en_progreso',
  REVISION     = 'revision',
  COMPLETADA   = 'completada',
  CANCELADA    = 'cancelada',
}

export enum PrioridadTarea {
  BAJA   = 'baja',
  MEDIA  = 'media',
  ALTA   = 'alta',
  URGENTE= 'urgente',
}

@Entity('proyecto_tareas')
export class Tarea extends BaseEntity {
  @Column()
  proyectoId!: number;

  @ManyToOne(() => Proyecto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proyectoId' })
  proyecto!: Proyecto;

  @Column()
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: EstadoTarea, default: EstadoTarea.PENDIENTE })
  estado!: EstadoTarea;

  @Column({ type: 'enum', enum: PrioridadTarea, default: PrioridadTarea.MEDIA })
  prioridad!: PrioridadTarea;

  @Column({ type: 'date', nullable: true })
  fechaInicio?: Date;

  @Column({ type: 'date', nullable: true })
  fechaVencimiento?: Date;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  horasEstimadas!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  horasReales!: number;

  @Column({ default: false })
  esHito!: boolean;

  @Column({ nullable: true })
  asignadoId?: number;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'asignadoId' })
  asignado?: User;

  @Column({ type: 'int', default: 0 })
  orden!: number;
}
