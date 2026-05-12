import { Entity, Column, OneToMany } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum EstadoLicitacion {
  IDENTIFICADA = 'identificada',
  EN_PROCESO   = 'en_proceso',
  PRESENTADA   = 'presentada',
  ADJUDICADA   = 'adjudicada',
  PERDIDA      = 'perdida',
  CANCELADA    = 'cancelada',
}

export enum TipoLicitacion {
  PUBLICA      = 'publica',
  PRIVADA      = 'privada',
  RESTRINGIDA  = 'restringida',
  EMERGENCIA   = 'emergencia',
}

@Entity('licitaciones')
export class Licitacion extends TenantBaseEntity {
  @Column({ length: 30 })
  numero!: string;

  @Column({ length: 300 })
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ length: 200 })
  entidadConvocante!: string;

  @Column({ length: 60, nullable: true })
  rncEntidad?: string;

  @Column({ type: 'enum', enum: TipoLicitacion, default: TipoLicitacion.PUBLICA })
  tipo!: TipoLicitacion;

  @Column({ type: 'enum', enum: EstadoLicitacion, default: EstadoLicitacion.IDENTIFICADA })
  estado!: EstadoLicitacion;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  montoEstimado?: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  montoOfertado?: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  montoAdjudicado?: number;

  @Column({ type: 'date' })
  fechaPublicacion!: Date;

  @Column({ type: 'date', nullable: true })
  fechaLimiteOfertas?: Date;

  @Column({ type: 'date', nullable: true })
  fechaApertura?: Date;

  @Column({ type: 'date', nullable: true })
  fechaAdjudicacion?: Date;

  @Column({ type: 'text', nullable: true })
  requisitos?: string;

  @Column({ type: 'text', nullable: true })
  motivoPerdida?: string;

  @Column({ length: 200, nullable: true })
  enlacePortal?: string;

  @Column({ nullable: true })
  responsableId?: number;

  @Column({ nullable: true })
  clienteId?: number;
}
