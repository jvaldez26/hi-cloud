import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AsientoContable } from './asiento-contable.entity';
import { CuentaContable } from './cuenta-contable.entity';

@Entity('asiento_lineas')
export class AsientoLinea extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @ManyToOne(() => AsientoContable, (a) => a.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asientoId' })
  asiento!: AsientoContable;

  @Column()
  asientoId!: number;

  @ManyToOne(() => CuentaContable, { eager: true })
  @JoinColumn({ name: 'cuentaContableId' })
  cuentaContable!: CuentaContable;

  @Column()
  cuentaContableId!: number;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debe!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  haber!: number;
}
