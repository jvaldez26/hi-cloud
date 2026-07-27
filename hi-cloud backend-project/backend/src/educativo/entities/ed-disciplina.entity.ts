import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_disciplina')
export class EdDisciplina {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() estudianteId!: number;
  @Column({ nullable: true }) seccionId?: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 30, nullable: true }) tipo?: string;
  @Column({ length: 100, nullable: true }) categoria?: string;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'text', nullable: true }) medidaTomada?: string;
  @Column({ nullable: true }) reportadoPor?: number;
  @Column({ default: false }) padresNotificados!: boolean;
  @Column({ type: 'timestamp', nullable: true }) fechaNotificacion?: Date;
  @Column({ length: 20, default: 'abierto' }) estado!: string;
  @Column({ type: 'text', nullable: true }) seguimiento?: string;
  @CreateDateColumn() createdAt!: Date;
}
