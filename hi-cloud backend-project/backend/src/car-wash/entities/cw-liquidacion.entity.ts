import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cw_liquidaciones')
export class CwLiquidacion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() lavadorId!: number;

  @Column({ type: 'date' }) desde!: string;
  @Column({ type: 'date' }) hasta!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 }) totalComisiones!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) totalAdelantos!: number;
  /** Lo que realmente salió de caja ahora = max(0, totalComisiones - totalAdelantos). */
  @Column({ type: 'decimal', precision: 10, scale: 2 }) totalPagado!: number;

  @Column({ type: 'varchar', length: 20, default: 'efectivo' }) metodoPago!: 'efectivo' | 'transferencia';
  @Column({ type: 'text', nullable: true }) referencia?: string;
  @Column({ type: 'int', nullable: true }) cuentaBancariaId?: number;

  @Column({ type: 'int', nullable: true }) retiroCajaId?: number;
  @Column() usuarioId!: number;

  @CreateDateColumn() createdAt!: Date;
}
