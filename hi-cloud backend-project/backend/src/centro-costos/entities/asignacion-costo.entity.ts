import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CentroCosto } from './centro-costo.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('asignaciones_costo')
export class AsignacionCosto extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  centroCostoId!: number;

  @ManyToOne(() => CentroCosto, { eager: true })
  @JoinColumn({ name: 'centroCostoId' })
  centroCosto!: CentroCosto;

  @Column({ length: 30 })
  tipoDocumento!: string; // 'factura' | 'gasto' | 'compra' | 'nomina'

  @Column()
  documentoId!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'int', default: 100 })
  porcentaje!: number; // % asignado a este centro (para repartir entre centros)

  @Column({ type: 'text', nullable: true })
  nota?: string;

  @Column({ type: 'date' })
  fecha!: Date;
}
