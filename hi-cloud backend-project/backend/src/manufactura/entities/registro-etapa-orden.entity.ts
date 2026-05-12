import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { OrdenProduccion } from './orden-produccion.entity';
import { EtapaRuta } from './etapa-ruta.entity';

export enum EstadoEtapaOrden {
  PENDIENTE   = 'pendiente',
  EN_PROCESO  = 'en_proceso',
  COMPLETADA  = 'completada',
  OMITIDA     = 'omitida',
  RECHAZADA   = 'rechazada',   // falló control de calidad
}

@Entity('registro_etapas_orden')
export class RegistroEtapaOrden extends TenantBaseEntity {
  @ManyToOne(() => OrdenProduccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordenId' })
  orden!: OrdenProduccion;

  @Column()
  ordenId!: number;

  @ManyToOne(() => EtapaRuta, { eager: true })
  @JoinColumn({ name: 'etapaId' })
  etapa!: EtapaRuta;

  @Column()
  etapaId!: number;

  @Column({ type: 'int', default: 1 })
  ordenEtapa!: number;

  @Column({ type: 'enum', enum: EstadoEtapaOrden, default: EstadoEtapaOrden.PENDIENTE })
  estado!: EstadoEtapaOrden;

  @Column({ type: 'timestamptz', nullable: true })
  fechaInicio?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaFin?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadProcesada!: number;

  @Column({ nullable: true })
  operadorId?: number;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;
}
