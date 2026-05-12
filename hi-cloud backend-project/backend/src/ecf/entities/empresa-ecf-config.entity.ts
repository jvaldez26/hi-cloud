import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum ModoEcf {
  TEST          = 'TEST',
  CERTIFICACION = 'CERTIFICACION',
  PRODUCCION    = 'PRODUCCION',
}

/**
 * Configuración de e-CF por empresa — credenciales MSeller cifradas en reposo.
 * Cada empresa tiene su propio email/password/apiKey de MSeller.
 *
 * Cifrado: AES-256-GCM con clave ECF_ENCRYPTION_KEY del entorno.
 * Formato almacenado: "<iv_b64>.<authTag_b64>.<ciphertext_b64>"
 */
@Entity('empresa_ecf_config')
@Index(['empresaId'], { unique: true })
export class EmpresaEcfConfig extends BaseEntity {
  @Column({ unique: true })
  empresaId!: number;

  // ── Credenciales MSeller (cifradas en reposo) ─────────────────────────────

  @Column({ length: 150, nullable: true })
  msellerEmail?: string;

  /** Contraseña MSeller — cifrada con AES-256-GCM */
  @Column({ type: 'text', nullable: true })
  msellerPasswordEnc?: string;

  /** API Key MSeller — cifrada con AES-256-GCM */
  @Column({ type: 'text', nullable: true })
  msellerApiKeyEnc?: string;

  // ── Entorno ───────────────────────────────────────────────────────────────

  @Column({ length: 300, default: 'https://ecf.api.mseller.app' })
  msellerUrlBase!: string;

  @Column({ type: 'enum', enum: ModoEcf, default: ModoEcf.TEST })
  modo!: ModoEcf;

  // ── Datos fiscales del emisor (pueden diferir del campo rnc de Empresa) ───

  @Column({ length: 11, nullable: true })
  rncEmisor?: string;

  @Column({ length: 300, nullable: true })
  razonSocialEmisor?: string;

  @Column({ length: 200, nullable: true })
  nombreComercial?: string;

  @Column({ length: 400, nullable: true })
  direccionEmisor?: string;

  @Column({ length: 100, nullable: true })
  municipio?: string;

  @Column({ length: 100, nullable: true })
  provincia?: string;

  // ── Control ───────────────────────────────────────────────────────────────

  @Column({ default: true })
  activo!: boolean;
}
