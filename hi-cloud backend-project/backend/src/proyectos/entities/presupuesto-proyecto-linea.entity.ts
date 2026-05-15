import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proyecto } from './proyecto.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum CategoriaPresupuesto {
  MANO_OBRA      = 'mano_obra',
  MATERIALES     = 'materiales',
  SUBCONTRATISTA = 'subcontratista',
  GASTOS_VIAJE   = 'gastos_viaje',
  LICENCIAS      = 'licencias',
  OTRO           = 'otro',
}

@TenantScoped()
@Entity('presupuesto_proyecto_lineas')
export class PresupuestoProyectoLinea extends TenantBaseEntity {
  @ManyToOne(() => Proyecto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proyectoId' })
  proyecto!: Proyecto;

  @Column()
  proyectoId!: number;

  @Column({ type: 'enum', enum: CategoriaPresupuesto, default: CategoriaPresupuesto.OTRO })
  categoria!: CategoriaPresupuesto;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  monto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  montoReal!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
