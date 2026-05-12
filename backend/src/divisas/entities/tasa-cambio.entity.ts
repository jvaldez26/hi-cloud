import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

@Entity('tasas_cambio')
@Index(['empresaId', 'moneda', 'fecha'])
export class TasaCambio extends TenantBaseEntity {
  @Column({ length: 3 })
  moneda!: string; // USD, EUR, GBP, etc.

  @Column({ length: 50, nullable: true })
  nombreMoneda?: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  tasaVenta!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  tasaCompra!: number;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ length: 50, nullable: true, default: 'Manual' })
  fuente?: string;
}
