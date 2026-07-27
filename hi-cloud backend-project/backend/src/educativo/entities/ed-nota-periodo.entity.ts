import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_notas_periodo')
export class EdNotaPeriodo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() estudianteId!: number;
  @Column() asignaturaId!: number;
  @Column() seccionId!: number;
  @Column() periodoId!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) notaFinal?: number;
  @Column({ length: 5, nullable: true }) notaLetra?: string;
  @Column({ nullable: true }) aprobado?: boolean;
  @Column({ type: 'text', nullable: true }) observacion?: string;
}
