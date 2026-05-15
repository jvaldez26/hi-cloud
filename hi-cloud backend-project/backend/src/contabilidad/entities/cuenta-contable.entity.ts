import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

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

@TenantScoped()
@Entity('cuentas_contables')
export class CuentaContable extends TenantBaseEntity {
  @Column({ length: 20 })
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
