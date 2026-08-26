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

  /**
   * Nota de la ENTREGA — lo que el repartidor apunta al dejar la mercancía
   * ("se entregó en el almacén trasero", "faltaba una caja, la firmó igual").
   *
   * NO es el motivo de una devolución: eso vive en motivoDevolucion, en su
   * propia columna. Son dos preguntas distintas y mezclarlas hace imposible
   * responder ninguna de las dos después.
   */
  @Column({ type: 'text', nullable: true })
  observacionesEntrega?: string;

  @Column({ nullable: true })
  sucursalId?: number;

  /** Almacén del que sale la mercancía (para descontar stock al entregar) */
  @Column({ nullable: true })
  almacenId?: number;

  /** Usuario que confirmó la entrega o devolución — se setea desde CLS, nunca del body */
  @Column({ nullable: true })
  entregadoPorUsuarioId?: number;

  /**
   * Por qué volvió la mercancía — obligatorio al pasar a DEVUELTO, validado en
   * el servicio y no solo en el DTO.
   *
   * Distinto de observacionesEntrega, que es la nota de la entrega. Los tres
   * conduces devueltos que había al crear la columna tenían las dos cosas en
   * null, así que no se migró nada de un campo al otro: aquí no hay motivos
   * viejos escondidos, solo salen guiones.
   */
  @Column({ length: 500, nullable: true })
  motivoDevolucion?: string;

  /** Quién registró la devolución — del CLS, nunca del body (igual que entregadoPorUsuarioId) */
  @Column({ nullable: true })
  devueltoPorUsuarioId?: number;

  /** Cuándo se registró la devolución — la pone el servidor, no llega del cliente */
  @Column({ type: 'timestamp', nullable: true })
  fechaDevolucion?: Date;
}
