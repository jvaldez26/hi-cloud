import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AccionAuditoria {
  CAMBIO_PLAN       = 'CAMBIO_PLAN',
  SUSPENSION        = 'SUSPENSION',
  REACTIVACION      = 'REACTIVACION',
  EXTENSION_TRIAL   = 'EXTENSION_TRIAL',
  DESCUENTO         = 'DESCUENTO',
  CANCELACION       = 'CANCELACION',
  SOLICITUD_APROBADA = 'SOLICITUD_APROBADA',
  SOLICITUD_RECHAZADA = 'SOLICITUD_RECHAZADA',
  FECHA_VENCIMIENTO_MANUAL = 'FECHA_VENCIMIENTO_MANUAL',
  RESET_FECHA_VENCIMIENTO = 'RESET_FECHA_VENCIMIENTO',
}

@Entity('suscripcion_auditoria')
export class SuscripcionAuditoria {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  suscripcionId!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 50 })
  accion!: AccionAuditoria;

  @Column({ type: 'jsonb', nullable: true })
  valorAnterior?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  valorNuevo?: Record<string, any>;

  @Column({ nullable: true })
  superAdminId?: number;

  @Column({ type: 'text', nullable: true })
  motivo?: string;

  @Column({ length: 45, nullable: true })
  ipOrigen?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
