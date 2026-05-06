import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum TipoTransaccionPuntos {
  ACUMULACION = 'acumulacion',
  CANJE       = 'canje',
  VENCIMIENTO = 'vencimiento',
  AJUSTE      = 'ajuste',
}

@Entity('transacciones_puntos')
@Index(['empresaId', 'clienteId'])
export class TransaccionPuntos extends TenantBaseEntity {
  @Column()
  clienteId!: number;

  @Column({ type: 'enum', enum: TipoTransaccionPuntos })
  tipo!: TipoTransaccionPuntos;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  puntos!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  montoReferencia?: number;

  @Column({ length: 50, nullable: true })
  referenciaId?: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  saldoAnterior!: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  saldoNuevo!: number;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
