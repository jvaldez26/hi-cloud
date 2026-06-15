import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('gm_miembros')
export class Miembro {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) numero!: string;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 100, nullable: true }) apellidos?: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: string;
  @Column({ length: 10, nullable: true }) sexo?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 20, nullable: true }) telefonoEmergencia?: string;
  @Column({ length: 100, nullable: true }) contactoEmergencia?: string;
  @Column({ length: 150, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) direccion?: string;
  @Column({ length: 500, nullable: true }) foto?: string;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) pesoInicial?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) tallaInicial?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) imcInicial?: number;
  @Column({ length: 200, nullable: true }) objetivo?: string;
  @Column({ length: 50, nullable: true }) nivelFitness?: string;
  @Column({ type: 'text', nullable: true }) condicionesMedicas?: string;
  @Column({ type: 'text', nullable: true }) lesiones?: string;
  @Column({ type: 'text', nullable: true }) medicamentos?: string;
  @Column({ length: 100, nullable: true }) codigoAcceso?: string;
  @Column({ default: 'activo' }) estado!: string;
  @Column({ nullable: true }) clienteId?: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
