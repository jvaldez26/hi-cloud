import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import type { ModoPagoLavadorCw } from './tipos';

export type EstadoComisionCw = 'activa' | 'anulada';

/** Todo congelado al momento de generarse (pasar el turno a LISTO) — cambiar
 *  después el catálogo de servicios o el modoPago del lavador no debe
 *  alterar lo ya ganado. */
@Entity('cw_comisiones')
export class CwComision {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() turnoId!: number;
  @Column() lavadorId!: number;

  /** NULL para 'por_vehiculo'/'porcentaje' (una fila por turno, no por servicio). */
  @Column({ type: 'int', nullable: true }) servicioId?: number;
  @Column({ type: 'varchar', length: 150, nullable: true }) servicioNombre?: string;

  @Column({ type: 'varchar', length: 20 }) modoPago!: ModoPagoLavadorCw;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) base!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) tarifaAplicada!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) porcentajeReparto!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) monto!: number;

  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'varchar', length: 20, default: 'activa' }) estado!: EstadoComisionCw;
  @Column({ type: 'text', nullable: true }) motivoAnulacion?: string;
  @Column({ type: 'int', nullable: true }) anuladoPorId?: number;
  @Column({ type: 'timestamp', nullable: true }) anuladoAt?: Date;

  @Column({ type: 'int', nullable: true }) liquidacionId?: number;

  @CreateDateColumn() createdAt!: Date;
}
