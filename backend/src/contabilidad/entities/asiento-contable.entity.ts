import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AsientoLinea } from './asiento-linea.entity';
import { User } from '../../users/users.entity';

export enum TipoOrigenAsiento {
  MANUAL   = 'manual',
  FACTURA  = 'factura',
  COMPRA   = 'compra',
  COBRO    = 'cobro',
  PAGO     = 'pago',
  AJUSTE   = 'ajuste',
}

export enum EstadoAsiento {
  BORRADOR       = 'borrador',
  CONTABILIZADO  = 'contabilizado',
  ANULADO        = 'anulado',
}

@Entity('asientos_contables')
export class AsientoContable extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ type: 'enum', enum: TipoOrigenAsiento, default: TipoOrigenAsiento.MANUAL })
  tipoOrigen!: TipoOrigenAsiento;

  @Column({ nullable: true })
  referenciaId?: number;

  @Column({ length: 50, nullable: true })
  referenciaFolio?: string;

  @Column({ type: 'enum', enum: EstadoAsiento, default: EstadoAsiento.BORRADOR })
  estado!: EstadoAsiento;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalDebe!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalHaber!: number;

  @OneToMany(() => AsientoLinea, (l) => l.asiento, { cascade: true, eager: true })
  lineas!: AsientoLinea[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
