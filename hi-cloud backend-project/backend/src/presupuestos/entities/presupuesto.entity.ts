import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { User } from '../../users/users.entity';
import { PresupuestoLinea } from './presupuesto-linea.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoPresupuesto {
  VENTAS   = 'ventas',
  COMPRAS  = 'compras',
  GASTOS   = 'gastos',
  CAJA     = 'caja',
  GENERAL  = 'general',
}

export enum EstadoPresupuesto {
  BORRADOR = 'borrador',
  APROBADO = 'aprobado',
  CERRADO  = 'cerrado',
}

@TenantScoped()
@Entity('presupuestos')
export class Presupuesto extends TenantBaseEntity {
  @Column({ type: 'int' })
  anio!: number;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'enum', enum: TipoPresupuesto })
  tipo!: TipoPresupuesto;

  @Column({ type: 'enum', enum: EstadoPresupuesto, default: EstadoPresupuesto.BORRADOR })
  estado!: EstadoPresupuesto;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalPresupuestado!: number;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @OneToMany(() => PresupuestoLinea, (l) => l.presupuesto, { cascade: true })
  lineas!: PresupuestoLinea[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
