import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Almacena las configuraciones editables de cada plan (nombre y precio).
 * El resto de límites/módulos se mantiene en código (PLANES).
 * El super admin puede actualizar nombre y precio desde el panel de administración.
 */
@Entity('plan_configuracion')
export class PlanConfiguracion {
  @PrimaryColumn({ length: 20 })
  clave!: string;   // 'trial' | 'basico' | 'profesional' | 'empresarial' | 'enterprise'

  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  precio!: number;  // RD$/mes

  @Column({ length: 200, nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
