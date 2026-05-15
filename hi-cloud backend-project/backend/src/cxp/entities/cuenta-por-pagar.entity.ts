import { Entity, Column, ManyToOne, OneToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { EstadoCuenta } from '../../common/enums/estado-cuenta.enum';
import { Compra } from '../../compras/entities/compra.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('cuentas_por_pagar')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'fechaVencimiento'])
export class CuentaPorPagar extends TenantBaseEntity {
  @OneToOne(() => Compra)
  @JoinColumn({ name: 'compraId' })
  compra!: Compra;

  @Column()
  compraId!: number;

  @ManyToOne(() => Proveedor, { eager: true })
  @JoinColumn({ name: 'proveedorId' })
  proveedor!: Proveedor;

  @Column()
  proveedorId!: number;

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

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
