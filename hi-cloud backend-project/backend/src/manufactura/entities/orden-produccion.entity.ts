import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ListaMateriales } from './lista-materiales.entity';

export enum EstadoOrdenProduccion {
  BORRADOR   = 'borrador',
  PLANIFICADA= 'planificada',
  EN_PROCESO = 'en_proceso',
  COMPLETADA = 'completada',
  CANCELADA  = 'cancelada',
}

@Entity('ordenes_produccion')
export class OrdenProduccion extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  numero!: string;

  @Column()
  listaId!: number;

  @ManyToOne(() => ListaMateriales, { eager: true })
  @JoinColumn({ name: 'listaId' })
  lista!: ListaMateriales;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadPlanificada!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadProducida!: number;

  @Column({ type: 'enum', enum: EstadoOrdenProduccion, default: EstadoOrdenProduccion.BORRADOR })
  estado!: EstadoOrdenProduccion;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date', nullable: true })
  fechaFinPlanificada?: Date;

  @Column({ type: 'date', nullable: true })
  fechaFinReal?: Date;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ nullable: true })
  responsableId?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  costoReal?: number;
}
