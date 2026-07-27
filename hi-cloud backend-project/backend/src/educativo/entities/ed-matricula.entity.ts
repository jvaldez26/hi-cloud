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
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) descuentoBeca!: number;
  @Column({ nullable: true }) becaId?: number;
  @Column({ length: 20, default: 'activa' }) estado!: string;
  @Column({ nullable: true }) facturaId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
