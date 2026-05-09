import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum TipoClienteECF {
  PERSONA_JURIDICA  = 'persona_juridica',   // E31
  PERSONA_FISICA    = 'persona_fisica',     // E31 (con RNC/cédula)
  CONSUMIDOR_FINAL  = 'consumidor_final',   // E32
  EXTRANJERO        = 'extranjero',         // E46
  REGIMEN_ESPECIAL  = 'regimen_especial',   // E44 (zonas francas)
  GUBERNAMENTAL     = 'gubernamental',      // E45 (entidades gobierno)
}

@Entity('clientes')
@Index(['empresaId', 'isActive'])
export class Cliente extends TenantBaseEntity {
  @Column({ length: 200 })
  nombre!: string;

  @Column({ length: 13, nullable: true })
  rfc?: string;

  @Column({ length: 11, nullable: true })
  rncReceptor?: string;

  @Column({ default: false })
  esExtranjero!: boolean;

  @Column({ type: 'enum', enum: TipoClienteECF, default: TipoClienteECF.CONSUMIDOR_FINAL })
  tipoCliente!: TipoClienteECF;

  @Column({ length: 300, nullable: true })
  razonSocial?: string;

  @Column({ length: 300, nullable: true })
  direccion?: string;

  @Column({ length: 100, nullable: true })
  ciudad?: string;

  @Column({ length: 100, nullable: true })
  estado?: string;

  @Column({ length: 10, nullable: true })
  codigoPostal?: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ length: 100, nullable: true })
  regimenFiscal?: string;

  @Column({ length: 50, nullable: true })
  usoCfdi?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ length: 64, nullable: true })
  sector?: string;

  @Column({ type: 'int', default: 30 })
  diasCredito!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  limiteCredito!: number;

  @Column({ length: 64, nullable: true, unique: true })
  portalToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  portalTokenExpiry?: Date;
}
