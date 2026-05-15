import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Presupuesto } from './presupuesto.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('presupuesto_lineas')
export class PresupuestoLinea extends TenantBaseEntity {
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
