import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_parcelas')
export class AgParcela {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'int', nullable: true }) fincaId?: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 50, nullable: true }) codigo?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) area?: number;
  @Column({ length: 20, default: 'tarea' }) unidadArea!: string;
  @Column({ length: 50, nullable: true }) tipoSuelo?: string;
  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true }) phSuelo?: number;
  @Column({ length: 30, default: 'disponible' }) estado!: string;
  @Column({ length: 100, nullable: true }) cultivoActual?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
