import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cl_receta_medicamentos')
export class RecetaMedicamento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() recetaId!: number;
  @Column({ length: 200 }) medicamento?: string;
  @Column({ length: 100, nullable: true }) concentracion?: string;
  @Column({ length: 50, nullable: true }) forma?: string;
  @Column({ length: 50, nullable: true }) via?: string;
  @Column({ length: 100, nullable: true }) dosis?: string;
  @Column({ length: 100, nullable: true }) frecuencia?: string;
  @Column({ length: 100, nullable: true }) duracion?: string;
  @Column({ type: 'int', nullable: true }) cantidad!: number | null;
  @Column({ type: 'text', nullable: true }) indicaciones!: string | null;
  @Column({ default: 1 }) orden!: number;
}
