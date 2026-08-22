import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoCierre {
  ABIERTA        = 'abierta',
  CERRADA        = 'cerrada',
  REVISADA       = 'revisada',
  /** Cierre administrativo sin cuadre: se usa para depurar cajas huérfanas
   *  (abiertas y nunca cerradas). No implica diferencia ni faltante del cajero.
   *  Excluida de los reportes de descuadre. */
  CERRADA_SISTEMA = 'cerrada_por_sistema',
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

  /** Total de cobros del turno, TODOS los métodos. Informativo. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosRecibidos!: number;

  /** Parte de `cobrosRecibidos` recibida en efectivo — la única que está en el cajón. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosEfectivo!: number;

  /** Resto (transferencia, cheque, tarjeta, depósito). NO entra en el esperado. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cobrosOtrosMedios!: number;

  /** Total de anticipos del turno, TODOS los métodos. Informativo. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAnticipos!: number;

  /** Parte de `totalAnticipos` recibida en efectivo — sí está en el cajón. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  anticiposEfectivo!: number;

  /** Resto de anticipos. NO entra en el esperado. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  anticiposOtrosMedios!: number;

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
