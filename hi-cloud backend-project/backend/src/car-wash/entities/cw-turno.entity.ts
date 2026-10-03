import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { EstadoTurnoCw, TipoVehiculoCw } from './tipos';

@Entity('cw_turnos')
export class CwTurno {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() sucursalId!: number;

  @Column() numeroDia!: number;
  @Column({ length: 20 }) codigo!: string;
  @Column({ type: 'date' }) fechaRD!: string;

  @Column({ length: 20 }) placa!: string;
  @Column({ type: 'varchar', length: 20 }) tipoVehiculo!: TipoVehiculoCw;
  @Column({ type: 'varchar', length: 100, nullable: true }) marca?: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) color?: string;
  @Column({ type: 'int', nullable: true }) clienteId?: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefono?: string;

  @Column({ type: 'varchar', length: 20, default: 'en_espera' }) estado!: EstadoTurnoCw;
  @Column({ type: 'int', nullable: true }) bahia?: number;
  @Column({ type: 'varchar', length: 150, nullable: true }) lavadorNombre?: string;

  @Column({ length: 64, unique: true }) tokenPublico!: string;

  @Column({ type: 'text', nullable: true }) notasDanos?: string;
  @Column({ type: 'text', nullable: true }) motivoCancelacion?: string;

  @Column({ type: 'timestamp', nullable: true }) enEsperaAt?: Date;
  @Column({ type: 'timestamp', nullable: true }) enLavadoAt?: Date;
  @Column({ type: 'timestamp', nullable: true }) secadoAt?: Date;
  @Column({ type: 'timestamp', nullable: true }) listoAt?: Date;
  @Column({ type: 'timestamp', nullable: true }) entregadoAt?: Date;
  @Column({ type: 'timestamp', nullable: true }) canceladoAt?: Date;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
