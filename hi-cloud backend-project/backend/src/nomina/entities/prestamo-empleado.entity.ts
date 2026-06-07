import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Empleado } from './empleado.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoPrestamo {
  ACTIVO  = 'activo',
  SALDADO = 'saldado',
  ANULADO = 'anulado',
}

@TenantScoped()
@Entity('nomina_prestamos')
@Index(['empresaId', 'empleadoId', 'estado'])
export class PrestamoEmpleado extends TenantBaseEntity {
  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column()
  empleadoId!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'int' })
  cuotas!: number;

  @Column({ type: 'int', default: 0 })
  cuotasPagadas!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  montoMensual!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  saldoPendiente!: number;

  @Column({ type: 'date' })
  fechaDesembolso!: Date;

  @Column({ length: 300, nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: EstadoPrestamo, default: EstadoPrestamo.ACTIVO })
  estado!: EstadoPrestamo;
}
