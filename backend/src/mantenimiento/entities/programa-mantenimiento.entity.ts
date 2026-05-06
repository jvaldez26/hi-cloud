import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ActivoFijo } from '../../activos-fijos/entities/activo-fijo.entity';
import { TipoMantenimiento } from './orden-mantenimiento.entity';

@Entity('programas_mantenimiento')
export class ProgramaMantenimiento extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  activoId!: number;

  @ManyToOne(() => ActivoFijo, { eager: true })
  @JoinColumn({ name: 'activoId' })
  activo!: ActivoFijo;

  @Column({ type: 'enum', enum: TipoMantenimiento, default: TipoMantenimiento.PREVENTIVO })
  tipo!: TipoMantenimiento;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'int', default: 30 })
  frecuenciaDias!: number;

  @Column({ type: 'date', nullable: true })
  ultimoMantenimiento?: Date;

  @Column({ type: 'date', nullable: true })
  proximoMantenimiento?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costoEstimado?: number;

  @Column({ default: true })
  habilitado!: boolean;
}
