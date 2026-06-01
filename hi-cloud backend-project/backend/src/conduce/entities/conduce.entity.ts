import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { ConduceDetalle } from './conduce-detalle.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoConduce {
  GENERADO    = 'generado',
  EN_TRANSITO = 'en_transito',
  ENTREGADO   = 'entregado',
  DEVUELTO    = 'devuelto',
}

@TenantScoped()
@Entity('conduces')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'clienteId'])
export class Conduce extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'date', nullable: true })
  fechaEntregaProgramada?: Date;

  @Column({ type: 'enum', enum: EstadoConduce, default: EstadoConduce.GENERADO })
  estado!: EstadoConduce;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ nullable: true })
  preFacturaId?: number;

  @Column({ length: 400 })
  direccionEntrega!: string;

  @Column({ length: 100, nullable: true })
  ciudad?: string;

  @Column({ length: 150, nullable: true })
  contactoEntrega?: string;

  @Column({ length: 20, nullable: true })
  telefonoContacto?: string;

  @Column({ length: 150, nullable: true })
  conductor?: string;

  @Column({ length: 20, nullable: true })
  vehiculo?: string;

  @OneToMany(() => ConduceDetalle, d => d.conduce, { cascade: true, eager: true })
  detalles!: ConduceDetalle[];

  @Column()
  usuarioId!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ type: 'timestamp', nullable: true })
  fechaEntregaReal?: Date;

  @Column({ type: 'text', nullable: true })
  observacionesEntrega?: string;

  @Column({ nullable: true })
  sucursalId?: number;

  /** Almacén del que sale la mercancía (para descontar stock al entregar) */
  @Column({ nullable: true })
  almacenId?: number;
}
