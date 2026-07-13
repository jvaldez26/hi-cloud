import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoCierre {
  ABIERTA  = 'abierta',
  CERRADA  = 'cerrada',
  REVISADA = 'revisada',
}

@TenantScoped()
@Entity('cierres_caja')
@Unique('UQ_caja_fecha_vendedor', ['fecha', 'vendedorId'])
export class CierreCaja {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'int', nullable: true })
  vendedorId?: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  vendedorNombre?: string;

  @Column({ type: 'int', nullable: true })
  sucursalId?: number;

  @Column({ type: 'enum', enum: EstadoCierre, default: EstadoCierre.ABIERTA })
  estado!: EstadoCierre;

  // Apertura
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoApertura!: number;

  // Ingresos del día
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasEfectivo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasTarjeta!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasTransferencia!: number;

  // Facturas emitidas con tipoPago=CREDITO (notas LIKE '%crédito%') — no afectan efectivo en caja
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ventasCredito!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosRecibidos!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAnticipos!: number;

  // Egresos
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  gastosEfectivo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  retiros!: number;

  // Cierre
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoCierre!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoFisico!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  diferencia!: number;

  @Column({ type: 'int', default: 0 })
  cantidadTransacciones!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // Desglose de billetes y método de pago al cierre (enviado por el POS)
  @Column({ type: 'jsonb', nullable: true })
  desgloseBilletes?: Record<string, number>;

  @Column({ type: 'jsonb', nullable: true })
  desglosePago?: Record<string, string>;

  @Column()
  userId!: number;

  @Column({ nullable: true })
  empresaId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
