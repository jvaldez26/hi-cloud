import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoComision {
  PENDIENTE = 'pendiente',
  APROBADA  = 'aprobada',
  PAGADA    = 'pagada',
  ANULADA   = 'anulada',
}

@TenantScoped()
@Entity('comisiones')
export class Comision {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  vendedorId!: number;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ length: 30, nullable: true })
  facturaFolio?: string;

  @Column({ length: 7 })
  periodo!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoVenta!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  porcentajeComision!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoComision!: number;

  @Column({ type: 'enum', enum: EstadoComision, default: EstadoComision.PENDIENTE })
  estado!: EstadoComision;

  @Column({ type: 'date', nullable: true })
  fechaPago?: Date;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column()
  userId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
