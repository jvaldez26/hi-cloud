import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum EstadoSolicitud {
  PENDIENTE = 'pendiente',
  APROBADA  = 'aprobada',
  RECHAZADA = 'rechazada',
}

@Entity('solicitud_cambio_plan')
export class SolicitudCambioPlan {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 20 })
  planSolicitado!: string;

  @Column({ length: 10, default: 'mensual' })
  modalidad!: string;

  @Column({ type: 'text', nullable: true })
  comentario?: string;

  @Column({ length: 20, default: EstadoSolicitud.PENDIENTE })
  estado!: EstadoSolicitud;

  @Column({ type: 'text', nullable: true })
  motivoRechazo?: string;

  @Column({ nullable: true })
  superAdminId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
