import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum TipoCuenta {
  ACTIVO     = 'activo',
  PASIVO     = 'pasivo',
  PATRIMONIO = 'patrimonio',
  INGRESO    = 'ingreso',
  COSTO      = 'costo',
  GASTO      = 'gasto',
}

export enum NaturalezaCuenta {
  DEUDORA   = 'deudora',   // activos, costos, gastos
  ACREEDORA = 'acreedora', // pasivos, patrimonio, ingresos
}

@Entity('cuentas_contables')
export class CuentaContable extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'enum', enum: TipoCuenta })
  tipo!: TipoCuenta;

  @Column({ type: 'enum', enum: NaturalezaCuenta })
  naturaleza!: NaturalezaCuenta;

  @Column({ type: 'int' })
  nivel!: number;

  @Column({ default: false })
  permiteMovimientos!: boolean;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaPadreId' })
  cuentaPadre?: CuentaContable;

  @Column({ nullable: true })
  cuentaPadreId?: number;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
