import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Presupuesto } from './presupuesto.entity';

@Entity('presupuesto_lineas')
export class PresupuestoLinea extends BaseEntity {
  @ManyToOne(() => Presupuesto, (p) => p.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'presupuestoId' })
  presupuesto!: Presupuesto;

  @Column()
  presupuestoId!: number;

  @Column({ type: 'int' })
  mes!: number;

  @Column({ length: 100, default: 'General' })
  categoria!: string;

  @Column({ length: 20, nullable: true })
  cuentaCodigo?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  montoPresupuestado!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
