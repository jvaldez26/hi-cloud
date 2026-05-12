import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { User } from '../../users/users.entity';
import { SolicitudCompraLinea } from './solicitud-compra-linea.entity';

export enum EstadoSolicitudCompra {
  BORRADOR   = 'borrador',
  ENVIADA    = 'enviada',
  APROBADA   = 'aprobada',
  RECHAZADA  = 'rechazada',
  EN_COTIZACION = 'en_cotizacion',
  PROCESADA  = 'procesada',
  CANCELADA  = 'cancelada',
}

export enum PrioridadSolicitud {
  BAJA    = 'baja',
  MEDIA   = 'media',
  ALTA    = 'alta',
  URGENTE = 'urgente',
}

@Entity('solicitudes_compra')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'solicitanteId'])
export class SolicitudCompra extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'solicitanteId' })
  solicitante!: User;

  @Column()
  solicitanteId!: number;

  @Column({ type: 'date' })
  fechaSolicitud!: Date;

  @Column({ type: 'date', nullable: true })
  fechaNecesidad?: Date;

  @Column({ type: 'enum', enum: EstadoSolicitudCompra, default: EstadoSolicitudCompra.BORRADOR })
  estado!: EstadoSolicitudCompra;

  @Column({ type: 'enum', enum: PrioridadSolicitud, default: PrioridadSolicitud.MEDIA })
  prioridad!: PrioridadSolicitud;

  @Column({ length: 200, nullable: true })
  departamento?: string;

  @Column({ type: 'text' })
  justificacion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  presupuestoEstimado!: number;

  @Column({ type: 'text', nullable: true })
  comentarioAprobacion?: string;

  @Column({ nullable: true })
  aprobadorId?: number;

  @Column({ type: 'date', nullable: true })
  fechaAprobacion?: Date;

  @OneToMany(() => SolicitudCompraLinea, (l) => l.solicitud, { cascade: true, eager: true })
  lineas!: SolicitudCompraLinea[];
}
