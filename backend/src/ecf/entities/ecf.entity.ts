import {
  Entity,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoECF } from './tipo-ecf.entity';
import { SecuenciaECF } from './secuencia-ecf.entity';
import { Factura } from '../../facturas/entities/factura.entity';

export enum EstadoDGII {
  // ── Estados originales (backward-compatible) ─────────────────────────────
  PENDIENTE    = 'pendiente',
  ACEPTADO     = 'aceptado',
  RECHAZADO    = 'rechazado',
  CONDICIONADO = 'condicionado',

  // ── Estados MSeller (máquina de estados extendida) ───────────────────────
  /** Comprobante creado localmente, aún no enviado a MSeller */
  BORRADOR        = 'borrador',
  /** Enviado a MSeller pero sin respuesta definitiva de DGII */
  PENDIENTE_ENVIO = 'pendiente_envio',
  /** MSeller confirmó recepción; DGII procesa en background */
  ENVIADO         = 'enviado',
  /** DGII aceptó con observaciones (código CONDICIONADO de DGII) */
  OBSERVADO       = 'observado',
  /** MSeller/DGII no disponible; modo contingencia offline */
  CONTINGENCIA    = 'contingencia',
}

/** Tipo de documento origen que generó este e-CF. */
export enum DocumentoOrigenTipo {
  FACTURA   = 'FACTURA',
  VENTA_POS = 'VENTA_POS',
}

@Entity('ecf')
@Index(['documentoOrigenTipo', 'documentoOrigenId'])
export class ECF extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 13 })
  numero!: string;

  @ManyToOne(() => TipoECF, { eager: true })
  @JoinColumn({ name: 'tipoECFId' })
  tipoECF!: TipoECF;

  @Column()
  tipoECFId!: number;

  @ManyToOne(() => SecuenciaECF)
  @JoinColumn({ name: 'secuenciaId' })
  secuencia!: SecuenciaECF;

  @Column()
  secuenciaId!: number;

  @OneToOne(() => Factura, { nullable: true, eager: false })
  @JoinColumn({ name: 'facturaId' })
  factura?: Factura;

  @Column({ nullable: true })
  facturaId?: number;

  // ── Origen genérico (para soporte POS + Facturas) ─────────────────────────

  /** 'FACTURA' | 'VENTA_POS' — determina el tipo de documento que lo originó */
  @Column({ length: 20, nullable: true })
  documentoOrigenTipo?: string;

  /** ID del documento origen (facturaId o id de venta POS) */
  @Column({ nullable: true })
  documentoOrigenId?: number;

  // ── Estado y fechas ──────────────────────────────────────────────────────

  @Column({ type: 'timestamp', nullable: true })
  fechaUso?: Date;

  @Column({ default: false })
  isUsado!: boolean;

  @Column({ type: 'enum', enum: EstadoDGII, default: EstadoDGII.PENDIENTE })
  estadoDGII!: EstadoDGII;

  // ── Campos originales (XML / firma — se mantienen para backward compat) ───

  @Column({ length: 6 })
  codigoSeguridad!: string;

  @Column({ type: 'text', nullable: true })
  xml?: string;

  @Column({ type: 'text', nullable: true })
  xmlRespuesta?: string;

  @Column({ type: 'text', nullable: true })
  firmaDigital?: string;

  @Column({ type: 'timestamp', nullable: true })
  fechaFirma?: Date;

  @Column({ type: 'int', default: 0 })
  intentosEnvio!: number;

  @Column({ type: 'timestamp', nullable: true })
  ultimoIntentoEnvio?: Date;

  @Column({ type: 'text', nullable: true })
  errorEnvio?: string;

  @Column({ length: 100, nullable: true })
  proveedorReferencia?: string;

  // ── Integración MSeller ──────────────────────────────────────────────────

  /**
   * internalTrackId devuelto por MSeller al enviar el documento.
   * UUID, único — se usa para consultas de estado y webhook matching.
   */
  @Index({ unique: true, sparse: true })
  @Column({ length: 36, nullable: true })
  trackId?: string;

  /** URL del código QR generado por MSeller / DGII */
  @Column({ type: 'text', nullable: true })
  qrUrl?: string;

  /**
   * JSON exacto enviado a MSeller (POST /documentos-ecf).
   * Guardado para auditoría, debugging y reintentos.
   */
  @Column({ type: 'jsonb', nullable: true })
  jsonEnviado?: Record<string, unknown>;

  /**
   * Respuesta completa de MSeller:
   * { rnc, ecf, internalTrackId, securityCode, qr_url, signedDate }
   */
  @Column({ type: 'jsonb', nullable: true })
  respuestaMSeller?: Record<string, unknown>;

  /** Respuesta / notificación específica de DGII (vía webhook o polling) */
  @Column({ type: 'jsonb', nullable: true })
  respuestaDgii?: Record<string, unknown>;

  // ── Datos del comprador denormalizados ────────────────────────────────────
  // Se guardan aquí para reproducir el JSON ECF sin JOINs adicionales.

  @Column({ length: 11, nullable: true })
  rncComprador?: string;

  @Column({ length: 300, nullable: true })
  razonSocialComprador?: string;

  @Column({ length: 400, nullable: true })
  direccionComprador?: string;

  // ── Montos denormalizados ─────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  montoExento?: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  montoGravado?: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  montoItbis?: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  montoTotal?: number;
}
