import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_productos_prestamo')
export class PrProductoPrestamo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoMinimo?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoMaximo?: number;
  @Column({ type: 'decimal', precision: 6, scale: 3 }) tasaInteresMensual!: number;
  @Column({ length: 20, default: 'mensual' }) tipoTasa!: string;
  @Column({ type: 'int', nullable: true }) plazoMinimoMeses?: number;
  @Column({ type: 'int', nullable: true }) plazoMaximoMeses?: number;
  @Column({ length: 20, default: 'mensual' }) frecuenciaPago!: string;
  @Column({ length: 20, default: 'frances' }) metodoAmortizacion!: string;
  @Column({ type: 'decimal', precision: 6, scale: 3, default: 0 }) porcentajeMora!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) cargoCierre!: number;
  @Column({ type: 'decimal', precision: 6, scale: 3, default: 0 }) porcentajeCargoCierre!: number;
  @Column({ type: 'int', default: 0 }) diasGracia!: number;
  // 'personal' | 'vehiculo' | 'hipotecario'
  @Column({ length: 20, default: 'personal' }) tipoCredito!: string;
  @Column({ default: false }) requiereGarantia!: boolean;
  @Column({ default: false }) requiereGarante!: boolean;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
