import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_progreso')
export class Progreso {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() miembroId!: number;
  @Column({ nullable: true }) entrenadorId?: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) peso?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) talla?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) imc?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) grasaCorporal?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) masaMuscular?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) pecho?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) cintura?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) cadera?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) brazoDerecho?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) brazoIzquierdo?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) musloDerecho?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) musloIzquierdo?: number;
  @Column({ length: 500, nullable: true }) fotoFrontal?: string;
  @Column({ length: 500, nullable: true }) fotoPerfil?: string;
  @Column({ length: 500, nullable: true }) fotoEspalda?: string;
  @Column({ type: 'text', nullable: true }) observaciones?: string;
  @CreateDateColumn() createdAt!: Date;
}
