import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoCajaChica {
  ACTIVA  = 'activa',
  CERRADA = 'cerrada',
}

@TenantScoped()
@Entity('cajas_chicas')
@Index(['empresaId', 'isActive'])
export class CajaChica extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoInicial!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  saldoActual!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoMaximoEgreso!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 20 })
  pctAlerta!: number;

  @Column({ nullable: true })
  responsableId?: number;

  @Column({ length: 150, nullable: true })
  nombreResponsable?: string;

  @Column({ type: 'enum', enum: EstadoCajaChica, default: EstadoCajaChica.ACTIVA })
  estado!: EstadoCajaChica;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
