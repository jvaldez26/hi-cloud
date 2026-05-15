import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum Frecuencia {
  DIARIA   = 'diaria',
  SEMANAL  = 'semanal',
  MENSUAL  = 'mensual',
  ANUAL    = 'anual',
}

@TenantScoped()
@Entity('facturas_recurrentes')
export class FacturaRecurrente extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 200 })
  nombre!: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ type: 'json' })
  detalles!: Array<{
    descripcion:    string;
    productoId?:    number;
    cantidad:       number;
    precioUnitario: number;
    porcentajeIva:  number;
  }>;

  @Column({ type: 'enum', enum: Frecuencia, default: Frecuencia.MENSUAL })
  frecuencia!: Frecuencia;

  @Column({ type: 'int', default: 1 })
  diaEjecucion!: number;   // 1-28 para mensual, 1-7 para semanal

  @Column({ type: 'date' })
  proximaEjecucion!: Date;

  @Column({ type: 'date', nullable: true })
  ultimaEjecucion?: Date;

  @Column({ type: 'date', nullable: true })
  fechaFin?: Date;

  @Column({ type: 'int', default: 0 })
  totalGeneradas!: number;

  @Column({ default: true })
  activa!: boolean;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
