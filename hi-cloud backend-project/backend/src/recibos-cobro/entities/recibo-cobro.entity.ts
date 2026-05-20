import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum MetodoPagoRecibo {
  EFECTIVO      = 'efectivo',
  TRANSFERENCIA = 'transferencia',
  CHEQUE        = 'cheque',
  TARJETA       = 'tarjeta',
  DEPOSITO      = 'deposito',
  OTRO          = 'otro',
}

@TenantScoped()
@Entity('recibos_cobro')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'clienteId'])
export class ReciboCobro extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ length: 200, nullable: true })
  clienteNombre?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'enum', enum: MetodoPagoRecibo, default: MetodoPagoRecibo.EFECTIVO })
  metodoPago!: MetodoPagoRecibo;

  @Column({ length: 300 })
  concepto!: string;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ length: 20, nullable: true })
  facturaFolio?: string;

  @Column({ nullable: true })
  cxcId?: number;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  // Caja diaria a la que se imputa este cobro (para cierre correcto)
  @Column({ nullable: true })
  cajaDiariaId?: number;

  @Column()
  usuarioId!: number;

  @Column({ length: 150, nullable: true })
  nombreUsuario?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
