import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { ActivoFijo } from './activo-fijo.entity';
import { MetodoDepreciacion } from './categoria-activo.entity';
import { User } from '../../users/users.entity';

@Entity('depreciaciones_activos')
export class DepreciacionActivo extends TenantBaseEntity {
  @ManyToOne(() => ActivoFijo, { eager: true })
  @JoinColumn({ name: 'activoId' })
  activo!: ActivoFijo;

  @Column()
  activoId!: number;

  @Column({ length: 7 })
  periodo!: string;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaFin!: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  tasaAplicada!: number;

  @Column({ type: 'enum', enum: MetodoDepreciacion })
  metodo!: MetodoDepreciacion;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  valorLibrosInicio!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  montoDepreciacion!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  valorLibrosFin!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  depreciacionAcumulada!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
