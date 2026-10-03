import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cw_adelantos')
export class CwAdelanto {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() lavadorId!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 }) monto!: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'text', nullable: true }) motivo?: string;
  @Column() usuarioId!: number;

  /** 'efectivo' sale de caja (registrarRetiro); 'transferencia' no toca caja. */
  @Column({ type: 'varchar', length: 20, default: 'efectivo' }) metodoPago!: 'efectivo' | 'transferencia';
  @Column({ type: 'text', nullable: true }) referencia?: string;
  @Column({ type: 'int', nullable: true }) cuentaBancariaId?: number;

  /** El retiro de caja que de verdad sacó el efectivo — ver CajaService.registrarRetiro. */
  @Column({ type: 'int', nullable: true }) retiroCajaId?: number;

  @Column({ default: false }) liquidado!: boolean;
  @Column({ type: 'int', nullable: true }) liquidacionId?: number;

  @CreateDateColumn() createdAt!: Date;
}
