import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_anios_escolares')
export class EdAnioEscolar {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 50 }) nombre!: string;
  @Column({ type: 'date' }) fechaInicio!: string;
  @Column({ type: 'date' }) fechaFin!: string;
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ default: false }) esActual!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
