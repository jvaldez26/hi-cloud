import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proyecto } from './proyecto.entity';

@Entity('hitos_proyecto')
export class HitoProyecto extends TenantBaseEntity {
  @ManyToOne(() => Proyecto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proyectoId' })
  proyecto!: Proyecto;

  @Column()
  proyectoId!: number;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ default: false })
  completado!: boolean;

  @Column({ type: 'date', nullable: true })
  fechaCompletado?: Date;
}
