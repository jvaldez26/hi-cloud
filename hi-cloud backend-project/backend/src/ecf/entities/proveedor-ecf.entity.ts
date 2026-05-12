import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum AmbienteECF {
  PRUEBAS = 'pruebas',
  PRODUCCION = 'produccion',
}

@Entity('proveedores_ecf')
export class ProveedorECF extends BaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 300 })
  apiUrl!: string;

  @Column({ length: 500 })
  apiKey!: string;

  @Column({ type: 'enum', enum: AmbienteECF, default: AmbienteECF.PRUEBAS })
  ambiente!: AmbienteECF;

  @Column({ type: 'text', nullable: true })
  certificadoDigital?: string;

  @Column({ length: 11 })
  rnc!: string;

  @Column({ length: 200 })
  razonSocial!: string;

  @Column({ type: 'json', nullable: true })
  configuracion?: Record<string, unknown>;
}
