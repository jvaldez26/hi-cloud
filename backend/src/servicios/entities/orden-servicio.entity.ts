import {
  Entity, Column, ManyToOne, OneToMany, JoinColumn,
  PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';

export enum EstadoOrden {
  RECIBIDO       = 'recibido',
  EN_DIAGNOSTICO = 'en_diagnostico',
  ESPERANDO_PIEZAS = 'esperando_piezas',
  EN_PROCESO     = 'en_proceso',
  LISTO          = 'listo',
  ENTREGADO      = 'entregado',
  COBRADO        = 'cobrado',
  CANCELADO      = 'cancelado',
}

@Entity('ordenes_servicio')
export class OrdenServicio {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  numero!: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ length: 300 })
  descripcionEquipo!: string;

  @Column({ type: 'text' })
  descripcionProblema!: string;

  @Column({ type: 'text', nullable: true })
  diagnostico?: string;

  @Column({ type: 'enum', enum: EstadoOrden, default: EstadoOrden.RECIBIDO })
  estado!: EstadoOrden;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'tecnicoId' })
  tecnico?: User;

  @Column({ nullable: true })
  tecnicoId?: number;

  @Column({ type: 'date', nullable: true })
  fechaPromesa?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  presupuesto?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalPiezas!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalManoObra!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total!: number;

  @OneToMany(() => OrdenServicioDetalle, (d) => d.orden, { cascade: true, eager: true })
  detalles!: OrdenServicioDetalle[];

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column()
  userId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('orden_servicio_detalles')
export class OrdenServicioDetalle {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => OrdenServicio, (o) => o.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordenId' })
  orden!: OrdenServicio;

  @Column()
  ordenId!: number;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: number;

  @Column({ type: 'enum', enum: ['pieza', 'mano_obra', 'otro'], default: 'pieza' })
  tipo!: string;
}
