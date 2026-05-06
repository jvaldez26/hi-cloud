import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum CargoVendedor {
  VENDEDOR           = 'Vendedor',
  EJECUTIVO_VENTAS   = 'Ejecutivo de Ventas',
  REPRESENTANTE      = 'Representante Comercial',
  SUPERVISOR         = 'Supervisor de Ventas',
  GERENTE_VENTAS     = 'Gerente de Ventas',
}

@Entity('vendedores')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'codigo'], { unique: true })
export class Vendedor extends TenantBaseEntity {
  @Column({ length: 10 })
  codigo!: string;

  @Column({ length: 150 })
  nombre!: string;

  @Column({ length: 11, nullable: true })
  cedula?: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ length: 100, nullable: true })
  zona?: string;

  @Column({ length: 60, nullable: true })
  cargo?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 5 })
  comisionPct!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  metaMensual!: number;

  @Column({ nullable: true })
  usuarioId?: number;

  @Column({ type: 'date', nullable: true })
  fechaIngreso?: Date;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ default: true })
  activo!: boolean;
}
