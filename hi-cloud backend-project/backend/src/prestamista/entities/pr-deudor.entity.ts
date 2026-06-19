import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('pr_deudores')
export class PrDeudor {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 200, nullable: true }) apellidos?: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ length: 20, nullable: true }) rnc?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: string;
  @Column({ length: 10, nullable: true }) sexo?: string;
  @Column({ length: 20, nullable: true }) estadoCivil?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 20, nullable: true }) telefonoTrabajo?: string;
  @Column({ length: 100, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) direccion?: string;
  @Column({ type: 'text', nullable: true }) direccionTrabajo?: string;
  @Column({ length: 100, nullable: true }) ocupacion?: string;
  @Column({ length: 200, nullable: true }) empresaLabora?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) ingresoMensual?: number;
  @Column({ type: 'int', nullable: true }) tiempoEmpleoMeses?: number;
  @Column({ length: 200, nullable: true }) referenciaNombre1?: string;
  @Column({ length: 20, nullable: true }) referenciaTelefono1?: string;
  @Column({ length: 200, nullable: true }) referenciaNombre2?: string;
  @Column({ length: 20, nullable: true }) referenciaTelefono2?: string;
  @Column({ type: 'int', nullable: true }) scoreCredito?: number;
  @Column({ length: 20, default: 'medio' }) nivelRiesgo!: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) totalPrestado!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) totalPagado!: number;
  @Column({ type: 'int', default: 0 }) prestamosActivos!: number;
  @Column({ type: 'int', default: 0 }) diasMoraHistorico!: number;
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ default: false }) enListaNegra!: boolean;
  @Column({ type: 'text', nullable: true }) motivoListaNegra?: string;
  @Column({ type: 'int', nullable: true }) clienteId?: number;
  @Column({ type: 'text', nullable: true }) foto?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
