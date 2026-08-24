import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoSolicitudActivacion {
  PENDIENTE_PAGO = 'pendiente_pago',
  PAGO_RECIBIDO  = 'pago_recibido',
  EN_PROCESO     = 'en_proceso',
  ACTIVADA       = 'activada',
  RECHAZADA      = 'rechazada',
}

/**
 * Solicitud de implementación de facturación electrónica.
 *
 * ── AQUÍ NO HAY NINGÚN CERTIFICADO ────────────────────────────────────────
 *
 * El PFX se valida en memoria y se descarta (ver certificado-pfx.service). De
 * él solo sobreviven tres metadatos no sensibles: si era válido, cuándo vence y
 * el nombre del titular. La clave no se guarda ni cifrada.
 *
 * Activar la facturación es MANUAL: esta fila no dispara nada. Jean confirma el
 * pago, configura MSeller y marca la solicitud como activada.
 */
@TenantScoped()
@Entity('solicitudes_activacion_ecf')
@Index(['empresaId', 'estado'])
export class SolicitudActivacionEcf {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ type: 'varchar', length: 20, default: EstadoSolicitudActivacion.PENDIENTE_PAGO })
  estado!: EstadoSolicitudActivacion;

  // ── Precio ────────────────────────────────────────────────────────────────

  /**
   * Monto CONGELADO al crear la solicitud. No se recalcula al mostrarla.
   *
   * Si mañana sube la tarifa, las solicitudes ya enviadas conservan lo que se
   * le prometió al cliente. Recalcular al pintar significaría cambiarle el
   * precio a alguien después de habérselo dicho.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoAcordado!: number;

  /** Con qué versión de la tabla de tarifas se cotizó. Ver tarifas-activacion. */
  @Column({ type: 'int', default: 1 })
  tarifaVersion!: number;

  // ── Certificado: SOLO metadatos ───────────────────────────────────────────

  /**
   * Se subió un PFX que abrió con su clave y NO estaba vencido.
   *
   * Es lo que determinó el precio. Un certificado vencido deja esto en false:
   * el archivo es válido pero no sirve para facturar.
   */
  @Column({ default: false })
  tieneCertificado!: boolean;

  @Column({ type: 'date', nullable: true })
  certificadoVenceEn?: Date | null;

  /**
   * CN del certificado. INFORMATIVO, para que Jean vea a nombre de quién viene.
   * NO se usa para validar que pertenece a la empresa: el formato varía entre
   * emisores y validar contra él rechazaría certificados buenos.
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  certificadoTitular?: string | null;

  /** El cliente subió un certificado pero estaba vencido. Contexto para Jean. */
  @Column({ default: false })
  certificadoVencido!: boolean;

  // ── Comprobante de pago ───────────────────────────────────────────────────

  /**
   * KEY de S3, no URL. La URL se firma on-demand cuando hay que mostrarla, así
   * la referencia sobrevive a cambios de bucket, región o esquema de acceso.
   * Mismo patrón que las imágenes de producto.
   *
   * NULL mientras no se haya subido: la solicitud se puede enviar sin pagar y
   * adjuntar el comprobante después.
   */
  @Column({ type: 'varchar', length: 400, nullable: true })
  comprobantePagoKey?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  comprobanteSubidoEn?: Date | null;

  // ── Contacto y trazabilidad ───────────────────────────────────────────────

  @Column({ type: 'varchar', length: 150, nullable: true })
  contactoNombre?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  contactoEmail?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  contactoTelefono?: string | null;

  @Column({ type: 'text', nullable: true })
  notas?: string | null;

  /** Quién la creó, del usuario autenticado — nunca del body. */
  @Column({ type: 'int', nullable: true })
  solicitadoPorUsuarioId?: number | null;

  // ── Resolución (Super Admin) ──────────────────────────────────────────────

  @Column({ type: 'timestamptz', nullable: true })
  pagoConfirmadoEn?: Date | null;

  @Column({ type: 'int', nullable: true })
  pagoConfirmadoPorUsuarioId?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  activadaEn?: Date | null;

  @Column({ type: 'text', nullable: true })
  motivoRechazo?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
