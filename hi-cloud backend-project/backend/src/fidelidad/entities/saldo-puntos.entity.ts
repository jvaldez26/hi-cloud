import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('saldo_puntos')
@Index(['empresaId', 'clienteId'], { unique: true })
export class SaldoPuntos extends TenantBaseEntity {
  @Column()
  clienteId!: number;

  @Column({ length: 200, nullable: true })
  clienteNombre?: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  puntosTotales!: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  puntosCanjeados!: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  puntosDisponibles!: number;

  @Column({ type: 'int', default: 0 })
  totalTransacciones!: number;

  @Column({ type: 'date', nullable: true })
  fechaUltimaActividad?: string;

  @Column({ type: 'date', nullable: true })
  fechaVencimiento?: string;
}
