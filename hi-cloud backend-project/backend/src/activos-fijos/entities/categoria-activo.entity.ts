import { Entity, Column } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum MetodoDepreciacion {
  LINEA_RECTA        = 'linea_recta',
  SALDO_DECRECIENTE  = 'saldo_decreciente',
}

@TenantScoped()
@Entity('categorias_activos')
export class CategoriaActivo extends TenantBaseEntity {
  @Column({ length: 10 })
  codigo!: string;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  tasaAnual!: number;

  @Column({ type: 'enum', enum: MetodoDepreciacion })
  metodo!: MetodoDepreciacion;

  @Column({ type: 'int' })
  vidaUtilAnios!: number;

  @Column({ length: 200, nullable: true })
  descripcion?: string;

  @Column({ length: 20, nullable: true })
  cuentaActivoCodigo?: string;

  @Column({ length: 20, nullable: true })
  cuentaDepreciacionCodigo?: string;

  @Column({ length: 20, nullable: true })
  cuentaGastoCodigo?: string;
}
