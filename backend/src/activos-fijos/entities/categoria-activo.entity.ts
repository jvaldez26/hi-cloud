import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum MetodoDepreciacion {
  LINEA_RECTA        = 'linea_recta',
  SALDO_DECRECIENTE  = 'saldo_decreciente',
}

@Entity('categorias_activos')
export class CategoriaActivo extends BaseEntity {
  @Column({ length: 10, unique: true })
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
