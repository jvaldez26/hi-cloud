import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_matriculas')
export class EdMatricula {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() estudianteId!: number;
  @Column() anioEscolarId!: number;
  @Column() gradoId!: number;
  @Column({ nullable: true }) seccionId?: number;
  @Column({ type: 'date', nullable: true }) fechaMatricula?: string;
  @Column({ length: 30, default: 'nuevo_ingreso' }) tipo!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoInscripcion?: number;
  // becaId/descuentoBeca eliminados (1763400000000-DropBecaFieldsDeEdMatriculas)
  // — eran informativos, sin ningún consumidor real. ed_estudiante_becas es
  // la fuente real de becas (ver src/educativo/becas/).
  @Column({ length: 20, default: 'activa' }) estado!: string;
  @Column({ nullable: true }) facturaId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
