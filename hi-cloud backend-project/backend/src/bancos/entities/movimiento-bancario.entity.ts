import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CuentaBancaria } from './cuenta-bancaria.entity';

export enum TipoMovimientoBanco {
  DEBITO  = 'debito',
  CREDITO = 'credito',
}

@Entity('movimientos_bancarios')
export class MovimientoBancario extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  cuentaId!: number;

  @ManyToOne(() => CuentaBancaria, { eager: false })
  @JoinColumn({ name: 'cuentaId' })
  cuenta!: CuentaBancaria;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ length: 60, nullable: true })
  referencia?: string;

  @Column({ type: 'enum', enum: TipoMovimientoBanco })
  tipo!: TipoMovimientoBanco;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  saldoResultante?: number;

  @Column({ default: false })
  conciliado!: boolean;

  // Vínculo con movimiento del sistema
  @Column({ nullable: true })
  sistemaId?: number;

  @Column({ length: 30, nullable: true })
  sistemaTipo?: string; // 'factura' | 'compra' | 'gasto' | 'tesoreria'
}
