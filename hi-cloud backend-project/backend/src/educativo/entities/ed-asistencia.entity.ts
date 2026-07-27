import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_asistencia')
export class EdAsistencia {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() estudianteId!: number;
  @Column() seccionId!: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 20 }) estado!: string;
  @Column({ nullable: true }) asignaturaId?: number;
  @Column({ type: 'text', nullable: true }) justificacion?: string;
  @Column({ nullable: true }) registradoPor?: number;
  @CreateDateColumn() createdAt!: Date;
}
