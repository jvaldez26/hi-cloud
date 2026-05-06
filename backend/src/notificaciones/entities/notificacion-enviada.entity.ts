import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TipoNotificacion {
  CXC_VENCIDA          = 'cxc_vencida',
  CXC_POR_VENCER       = 'cxc_por_vencer',
  CXP_VENCIDA          = 'cxp_vencida',
  CXP_POR_VENCER       = 'cxp_por_vencer',
  STOCK_BAJO           = 'stock_bajo',
  ECF_SECUENCIA_VENCE  = 'ecf_secuencia_vence',
  NOMINA_PENDIENTE     = 'nomina_pendiente',
  MANUAL               = 'manual',
}

export enum CanalNotificacion {
  EMAIL     = 'email',
  WHATSAPP  = 'whatsapp',
  SISTEMA   = 'sistema',
}

@Entity('notificaciones_enviadas')
export class NotificacionEnviada {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'enum', enum: TipoNotificacion })
  tipo!: TipoNotificacion;

  @Column({ type: 'enum', enum: CanalNotificacion, default: CanalNotificacion.EMAIL })
  canal!: CanalNotificacion;

  @Column({ length: 200 })
  destinatario!: string;

  @Column({ length: 300 })
  asunto!: string;

  @Column({ type: 'text' })
  mensaje!: string;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  @Column({ default: false })
  exitoso!: boolean;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ nullable: true })
  userId?: number;

  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
