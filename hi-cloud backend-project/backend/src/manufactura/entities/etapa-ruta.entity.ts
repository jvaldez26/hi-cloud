import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { RutaProduccion } from './ruta-produccion.entity';
import { CentroTrabajo } from './centro-trabajo.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('etapas_ruta')
export class EtapaRuta extends TenantBaseEntity {
  @ManyToOne(() => RutaProduccion, (r) => r.etapas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rutaId' })
  ruta!: RutaProduccion;

  @Column()
  rutaId!: number;

  @ManyToOne(() => CentroTrabajo, { eager: true, nullable: true })
  @JoinColumn({ name: 'centroTrabajoId' })
  centroTrabajo?: CentroTrabajo;

  @Column({ nullable: true })
  centroTrabajoId?: number;

  @Column({ type: 'int', default: 1 })
  orden!: number;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  tiempoSetupMin!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  tiempoOperacionMinPorUnidad!: number;

  @Column({ default: false })
  esControl!: boolean;   // etapa de control de calidad
}
