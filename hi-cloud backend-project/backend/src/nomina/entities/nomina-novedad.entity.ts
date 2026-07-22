import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Empleado } from './empleado.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoNovedad {
  BONO         = 'bono',
  HORAS_EXTRAS = 'horas_extras',
  AUSENCIA     = 'ausencia',
  DESCUENTO    = 'descuento',
  OTRO         = 'otro',
}

@TenantScoped()
@Entity('nomina_novedades')
export class NominaNovedadEmpleado extends TenantBaseEntity {
  @ManyToOne(() => Empleado)
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column()
  empleadoId!: number;

  @Column({ nullable: true })
  periodoId?: number;

  @Column({ type: 'enum', enum: TipoNovedad })
  tipo!: TipoNovedad;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto!: number;

  @Column({ type: 'int', default: 0 })
  horasExtras!: number;

  @Column({ default: false })
  aplicado!: boolean;
}
