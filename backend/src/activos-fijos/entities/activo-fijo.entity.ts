import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CategoriaActivo } from './categoria-activo.entity';
import { User } from '../../users/users.entity';

export enum EstadoActivo {
  ACTIVO                  = 'activo',
  VENDIDO                 = 'vendido',
  DADO_DE_BAJA            = 'dado_de_baja',
  TOTALMENTE_DEPRECIADO   = 'totalmente_depreciado',
}

@Entity('activos_fijos')
export class ActivoFijo extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 30, unique: true })
  codigo!: string;

  @Column({ length: 200 })
  descripcion!: string;

  @ManyToOne(() => CategoriaActivo, { eager: true })
  @JoinColumn({ name: 'categoriaId' })
  categoria!: CategoriaActivo;

  @Column()
  categoriaId!: number;

  @Column({ type: 'date' })
  fechaAdquisicion!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  costoAdquisicion!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  valorResidual!: number;

  @Column({ type: 'int' })
  vidaUtilAnios!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  valorLibros!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  depreciacionAcumulada!: number;

  @Column({ type: 'enum', enum: EstadoActivo, default: EstadoActivo.ACTIVO })
  estado!: EstadoActivo;

  @Column({ length: 100, nullable: true })
  ubicacion?: string;

  @Column({ length: 100, nullable: true })
  proveedor?: string;

  @Column({ length: 50, nullable: true })
  numeroSerie?: string;

  @Column({ type: 'date', nullable: true })
  fechaBaja?: Date;

  @Column({ type: 'text', nullable: true })
  motivoBaja?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  valorVenta?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
