import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { ReglaDistribucion } from './regla-distribucion.entity';

@Entity('regla_distribucion_lineas')
export class ReglaDistribucionLinea extends TenantBaseEntity {
  @ManyToOne(() => ReglaDistribucion, (r) => r.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reglaId' })
  regla!: ReglaDistribucion;

  @Column()
  reglaId!: number;

  @Column()
  cuentaDestinoId!: number;

  @Column({ length: 200, nullable: true })
  cuentaDestinoNombre?: string;

  @Column({ nullable: true })
  centroCostoId?: number;

  @Column({ length: 100, nullable: true })
  centroCostoNombre?: string;

  @Column({ type: 'decimal', precision: 7, scale: 4 })
  porcentaje!: number;   // 25.5000 = 25.5%

  @Column({ length: 200, nullable: true })
  descripcion?: string;
}
