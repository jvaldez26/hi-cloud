import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cl_receta_medicamentos')
export class RecetaMedicamento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() recetaId!: number;
  @Column({ length: 200 }) medicamento!: string;
  @Column({ length: 100, nullable: true }) concentracion!: string | null;
  @Column({ length: 50, nullable: true }) forma!: string | null;
  @Column({ length: 50, nullable: true }) via!: string | null;
  @Column({ length: 100, nullable: true }) dosis!: string | null;
  @Column({ length: 100, nullable: true }) frecuencia!: string | null;
  @Column({ length: 100, nullable: true }) duracion!: string | null;
  @Column({ type: 'int', nullable: true }) cantidad!: number | null;
  @Column({ type: 'text', nullable: true }) indicaciones!: string | null;
  @Column({ default: 1 }) orden!: number;
}
