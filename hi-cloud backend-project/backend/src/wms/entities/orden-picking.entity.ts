import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Almacen } from '../../almacenes/entities/almacen.entity';
import { User } from '../../users/users.entity';
import { OrdenPickingLinea } from './orden-picking-linea.entity';

export enum TipoOrdenPicking {
  SALIDA_VENTA   = 'salida_venta',
  TRANSFERENCIA  = 'transferencia',
  DEVOLUCION     = 'devolucion',
  AJUSTE         = 'ajuste',
}

export enum EstadoPicking {
  BORRADOR    = 'borrador',
  ASIGNADA    = 'asignada',
  EN_PROCESO  = 'en_proceso',
  EMPACADA    = 'empacada',
  DESPACHADA  = 'despachada',
  CANCELADA   = 'cancelada',
}

@Entity('wms_ordenes_picking')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'operadorId'])
export class OrdenPicking extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'enum', enum: TipoOrdenPicking, default: TipoOrdenPicking.SALIDA_VENTA })
  tipo!: TipoOrdenPicking;

  @Column({ type: 'enum', enum: EstadoPicking, default: EstadoPicking.BORRADOR })
  estado!: EstadoPicking;

  @ManyToOne(() => Almacen, { eager: true })
  @JoinColumn({ name: 'almacenId' })
  almacen!: Almacen;

  @Column()
  almacenId!: number;

  @Column({ nullable: true })
  facturaId?: number;     // enlace a factura de ventas

  @Column({ nullable: true })
  transferId?: number;    // enlace a transferencia entre almacenes

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'operadorId' })
  operador?: User;

  @Column({ nullable: true })
  operadorId?: number;

  @Column({ nullable: true })
  creadoPorId?: number;

  @Column({ type: 'timestamptz', nullable: true })
  fechaAsignacion?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaInicio?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaEmpacado?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaDespachado?: Date;

  @Column({ type: 'int', default: 2 })
  prioridad!: number;   // 1=urgente, 2=normal, 3=baja

  @Column({ type: 'text', nullable: true })
  observaciones?: string;

  @Column({ length: 100, nullable: true })
  destinatario?: string;

  @Column({ length: 200, nullable: true })
  direccionEntrega?: string;

  @OneToMany(() => OrdenPickingLinea, (l) => l.orden, { cascade: true, eager: true })
  lineas!: OrdenPickingLinea[];
}
