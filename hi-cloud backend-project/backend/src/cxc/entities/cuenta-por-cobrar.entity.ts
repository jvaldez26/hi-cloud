import { Entity, Column, ManyToOne, OneToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { EstadoCuenta } from '../../common/enums/estado-cuenta.enum';
import { Factura } from '../../facturas/entities/factura.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('cuentas_por_cobrar')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'fechaVencimiento'])
export class CuentaPorCobrar extends TenantBaseEntity {
  @OneToOne(() => Factura)
  @JoinColumn({ name: 'facturaId' })
  factura!: Factura;

  @Column()
  facturaId!: number;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  montoOriginal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoPagado!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  montoPendiente!: number;

  @Column({ type: 'date' })
  fechaEmision!: Date;

  @Column({ type: 'date' })
  fechaVencimiento!: Date;

  @Column({ type: 'int', default: 30 })
  diasVencimiento!: number;

  @Column({ type: 'enum', enum: EstadoCuenta, default: EstadoCuenta.PENDIENTE })
  estado!: EstadoCuenta;

  /** Moneda de la factura original (DOP, USD, etc.) */
  @Column({ length: 3, default: 'DOP' })
  moneda!: string;

  /** Tasa de cambio al momento de emisión de la factura */
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
