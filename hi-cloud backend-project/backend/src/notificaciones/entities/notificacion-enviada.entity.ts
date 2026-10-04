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
  /** Va por el 80% de los e-CF incluidos en su plan. */
  ECF_CUOTA_80         = 'ecf_cuota_80',
  /** Pasó los e-CF incluidos: desde aquí el exceso se factura aparte. */
  ECF_CUOTA_EXCEDIDA   = 'ecf_cuota_excedida',
  NOMINA_PENDIENTE     = 'nomina_pendiente',
  MANUAL               = 'manual',
  /** HiCloud Xlink — llegó un documento nuevo (canal SISTEMA, campanita). */
  XLINK_DOCUMENTO_RECIBIDO = 'xlink_documento_recibido',
  /** Hay una caja abierta de un día anterior sin cerrar (canal SISTEMA, campanita). */
  CAJA_HUERFANA = 'caja_huerfana',
  /** Cuenta bloqueada por intentos fallidos de login — al dueño de la cuenta. */
  LOGIN_BLOQUEADO = 'login_bloqueado',
  /** Supervisor bloqueado por intentos fallidos en el POS — al supervisor. */
  SUPERVISOR_BLOQUEADO = 'supervisor_bloqueado',
  /** 3+ bloqueos de la misma cuenta en 24h — a los admins de sus empresas. */
  POSIBLE_ACCESO_NO_AUTORIZADO = 'posible_acceso_no_autorizado',
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
