import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { CuentaEstadistica } from './cuenta-estadistica.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('movimientos_estadisticos')
@Index(['empresaId', 'cuentaId', 'fecha'])
export class MovimientoEstadistico extends TenantBaseEntity {
  @ManyToOne(() => CuentaEstadistica, (c) => c.movimientos)
  @JoinColumn({ name: 'cuentaId' })
  cuenta!: CuentaEstadistica;

  @Column()
  cuentaId!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  valor!: number;

  @Column({ length: 200, nullable: true })
  descripcion?: string;

  @Column({ length: 50, nullable: true })
  referencia?: string;

  @Column({ nullable: true })
  userId?: number;
}
