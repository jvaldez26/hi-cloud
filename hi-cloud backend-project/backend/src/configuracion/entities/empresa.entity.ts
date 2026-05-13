import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum TipoSociedad {
  SRL            = 'SRL',
  SA             = 'SA',
  EIRL           = 'EIRL',
  PERSONA_FISICA = 'PERSONA_FISICA',
  ONG            = 'ONG',
  OTRO           = 'OTRO',
}

export enum SectorEmpresa {
  COMERCIO     = 'COMERCIO',
  SERVICIOS    = 'SERVICIOS',
  MANUFACTURA  = 'MANUFACTURA',
  CONSTRUCCION = 'CONSTRUCCION',
  SALUD        = 'SALUD',
  EDUCACION    = 'EDUCACION',
  TECNOLOGIA   = 'TECNOLOGIA',
  AGROPECUARIO = 'AGROPECUARIO',
  OTRO         = 'OTRO',
}

export enum RegimenFiscal {
  ORDINARIO = 'ORDINARIO',
  PST       = 'PST',
  RST       = 'RST',
}

export enum PlanSuscripcion {
  TRIAL       = 'TRIAL',
  BASICO      = 'BASICO',
  PROFESIONAL = 'PROFESIONAL',
  EMPRESARIAL = 'EMPRESARIAL',
  ENTERPRISE  = 'ENTERPRISE',
}

/**
 * Entidad Empresa — columnas en sincronía con el schema actual de la BD.
 * Las columnas nuevas (tipoSociedad, sector, regimen, configuracion, etc.)
 * se agregarán en una migración posterior.
 */
@Entity('empresa')
export class Empresa extends BaseEntity {
  @Column({ length: 11, unique: true })
  rnc!: string;

  @Column({ length: 300 })
  nombre!: string;

  @Column({ length: 200, nullable: true })
  nombreComercial?: string;

  @Column({ length: 400, nullable: true, default: '' })
  direccion?: string;

  @Column({ length: 100, nullable: true, default: 'Santo Domingo' })
  ciudad?: string;

  @Column({ length: 100, nullable: true })
  provincia?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ length: 150, nullable: true })
  email?: string;

  @Column({ length: 300, nullable: true })
  sitioWeb?: string;

  @Column({ type: 'text', nullable: true })
  logo?: string;

  @Column({ length: 100, nullable: true })
  sector?: string;

  @Column({ length: 100, nullable: true })
  regimenFiscal?: string;

  @Column({ length: 200, nullable: true })
  representanteLegal?: string;

  @Column({ type: 'date', nullable: true })
  fechaConstitucion?: Date;

  @Column({ length: 200, nullable: true })
  actividadEconomica?: string;

  @Column({ length: 10, nullable: true })
  codigoPostal?: string;

  @Column({ length: 30, nullable: true })
  moneda?: string;

  @Column({ length: 50, nullable: true, default: 'America/Santo_Domingo' })
  zonaHoraria?: string;

  // ── Campos extendidos (migración 2026-05) ──────────────────────────────────

  @Column({ length: 50, nullable: true })
  tipoSociedad?: string;

  @Column({ length: 13, nullable: true })
  cedulaRepresentante?: string;

  @Column({ length: 200, nullable: true })
  direccion2?: string;

  @Column({ length: 20, nullable: true })
  telefonoSecundario?: string;

  @Column({ type: 'text', nullable: true })
  favicon?: string;

  /** JSONB libre para branding, facturación, POS, notificaciones, seguridad */
  @Column({ type: 'jsonb', nullable: true, default: {} })
  configuracion?: Record<string, unknown>;

  // ── Crédito ───────────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 30 })
  diasCreditoDefault!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  limiteCreditoDefault!: number;

  @Column({ default: true })
  creditoHabilitado!: boolean;
}
