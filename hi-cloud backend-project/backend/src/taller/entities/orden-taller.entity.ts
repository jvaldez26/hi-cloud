import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tm_ordenes')
export class OrdenTaller {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20 }) numero!: string;
  @Column() vehiculoId!: number;
  @Column({ type: 'int', nullable: true }) clienteId!: number | null;
  @Column({ type: 'timestamp' }) fechaIngreso!: Date;
  @Column({ type: 'int', nullable: true }) kilometrajeIngreso!: number | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) nivelCombustible!: string | null;
  @Column({ type: 'text' }) motivoIngreso!: string;
  @Column({ type: 'text', nullable: true }) diagnosticoInicial!: string | null;
  @Column({ type: 'int', nullable: true }) tecnicoId!: number | null;
  @Column({ length: 20, default: 'normal' }) prioridad!: string;
  @Column({ length: 30, default: 'recibido' }) estado!: string;
  @Column({ type: 'timestamp', nullable: true }) fechaDiagnostico!: Date | null;
  @Column({ type: 'timestamp', nullable: true }) fechaAprobacion!: Date | null;
  @Column({ type: 'timestamp', nullable: true }) fechaInicio!: Date | null;
  @Column({ type: 'date', nullable: true }) fechaEstimadaEntrega!: string | null;
  @Column({ type: 'timestamp', nullable: true }) fechaFinalizacion!: Date | null;
  @Column({ type: 'timestamp', nullable: true }) fechaEntrega!: Date | null;
  @Column({ default: false }) presupuestoAprobado!: boolean;
  @Column({ type: 'varchar', length: 100, nullable: true }) aprobadoPor!: string | null;
  @Column({ type: 'timestamp', nullable: true }) aprobadoFecha!: Date | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) formaAprobacion!: string | null;
  @Column({ default: false }) tieneRayones!: boolean;
  @Column({ default: false }) tieneGolpes!: boolean;
  @Column({ default: false }) tieneDocumentos!: boolean;
  @Column({ default: false }) tieneGato!: boolean;
  @Column({ default: false }) tieneHerramientas!: boolean;
  @Column({ type: 'text', nullable: true }) observacionesIngreso!: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotalManoObra!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotalRepuestos!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) itbis!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total!: number;
  @Column({ default: 0 }) garantiaDias!: number;
  @Column({ default: 0 }) garantiaKm!: number;
  @Column({ type: 'int', nullable: true }) facturaId!: number | null;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @Column({ type: 'int', nullable: true }) createdBy!: number | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
