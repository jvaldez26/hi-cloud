import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

@Entity('credito_cliente')
@Index(['empresaId', 'clienteId'], { unique: true })
export class CreditoCliente extends TenantBaseEntity {
  @Column()
  clienteId!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  limiteCredito!: number;

  @Column({ type: 'int', default: 30 })
  diasPlazo!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  saldoUtilizado!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
