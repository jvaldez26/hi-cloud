import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { UnidadMedida } from './unidad-medida.entity';

@Entity('conversiones_uom')
@Index(['empresaId', 'unidadDesdeId', 'unidadHastaId'])
export class ConversionUom extends TenantBaseEntity {
  @ManyToOne(() => UnidadMedida, { eager: true })
  @JoinColumn({ name: 'unidadDesdeId' })
  unidadDesde!: UnidadMedida;

  @Column()
  unidadDesdeId!: number;

  @ManyToOne(() => UnidadMedida, { eager: true })
  @JoinColumn({ name: 'unidadHastaId' })
  unidadHasta!: UnidadMedida;

  @Column()
  unidadHastaId!: number;

  // 1 unidadDesde = factor unidadHasta
  // Ej: 1 KG = 1000 G → factor = 1000
  @Column({ type: 'decimal', precision: 18, scale: 8 })
  factor!: number;
}
