import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_estudiante_becas')
export class EdEstudianteBeca {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() estudianteId!: number;
  @Column() becaId!: number;
  @Column({ nullable: true }) anioEscolarId?: number;
  @Column({ type: 'date', default: () => 'CURRENT_DATE' }) fechaAsignacion!: string;
  @Column({ type: 'text', nullable: true }) motivo?: string;
  @Column({ length: 200, nullable: true }) aprobadoPor?: string;
  @Column({ default: true }) isActive!: boolean;
}
