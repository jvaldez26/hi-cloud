import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_secciones')
export class EdSeccion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() gradoId!: number;
  @Column({ nullable: true }) anioEscolarId?: number;
  @Column({ length: 50 }) nombre!: string;
  @Column({ default: 30 }) capacidadMaxima!: number;
  @Column({ length: 50, nullable: true }) aula?: string;
  @Column({ nullable: true }) tutorId?: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
