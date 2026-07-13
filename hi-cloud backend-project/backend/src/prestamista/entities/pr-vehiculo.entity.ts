import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_vehiculos')
export class PrVehiculo {
  @PrimaryGeneratedColumn() id!: number;

  @Column() empresaId!: number;
  @Column({ type: 'int', nullable: true }) sucursalId?: number;

  // ── Identificación ────────────────────────────────────────────────────────
  @Column({ length: 20, nullable: true }) placa?: string;
  @Column({ length: 50, nullable: true }) chasis?: string;
  @Column({ length: 50, nullable: true }) motor?: string;
  @Column({ length: 50, nullable: true }) marca?: string;
  @Column({ length: 50, nullable: true }) modelo?: string;
  @Column({ type: 'int', nullable: true }) anio?: number;
  @Column({ length: 30, nullable: true }) color?: string;

  // SEDAN | JEEPETA | CAMION | MOTOR | AUTOBUS | PICKUP | etc.
  @Column({ length: 30, nullable: true }) tipoVehiculo?: string;

  // ── Valores ───────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true }) valorMercado?: number;
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true }) valorFactura?: number;

  // ── Seguro ────────────────────────────────────────────────────────────────
  @Column({ length: 100, nullable: true }) aseguradora?: string;
  @Column({ length: 50, nullable: true }) polizaSeguro?: string;
  @Column({ type: 'date', nullable: true }) fechaVencePoliza?: string;

  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
