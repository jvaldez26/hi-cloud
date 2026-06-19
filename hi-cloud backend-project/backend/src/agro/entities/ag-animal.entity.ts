import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_animales')
export class AgAnimal {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'int', nullable: true }) fincaId?: number;
  @Column({ length: 50, nullable: true }) numero?: string;
  @Column({ length: 100, nullable: true }) nombre?: string;
  @Column({ length: 50 }) tipo!: string;
  @Column({ length: 100, nullable: true }) raza?: string;
  @Column({ length: 10, nullable: true }) sexo?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: string;
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true }) pesoNacimiento?: number;
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true }) pesoActual?: number;
  @Column({ length: 50, nullable: true }) color?: string;
  @Column({ length: 50, nullable: true }) origen?: string;
  @Column({ type: 'int', nullable: true }) madreId?: number;
  @Column({ type: 'int', nullable: true }) padreId?: number;
  @Column({ length: 50, nullable: true }) proposito?: string;
  @Column({ length: 30, default: 'activo' }) estado!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) costoAdquisicion?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ type: 'text', nullable: true }) fotoUrl?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
