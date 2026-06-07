import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Empleado } from './empleado.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoAnticipo {
  PENDIENTE  = 'pendiente',
  DESCONTADO = 'descontado',
  ANULADO    = 'anulado',
}

@TenantScoped()
@Entity('nomina_anticipos')
@Index(['empresaId', 'empleadoId', 'estado'])
export class AnticipoNomina extends TenantBaseEntity {
  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column()
  empleadoId!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ length: 7 })
  periodoDescontar!: string;

  @Column({ length: 300, nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: EstadoAnticipo, default: EstadoAnticipo.PENDIENTE })
  estado!: EstadoAnticipo;
}
