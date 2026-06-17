import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';
import { ProFormaItem } from './pro-forma-item.entity';

export enum ProFormaEstado {
  ACTIVA  = 'ACTIVA',
  VENCIDA = 'VENCIDA',
}

@TenantScoped()
@Entity('pro_formas')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class ProForma extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ default: 30 })
  validezDias!: number;

  @Column({ type: 'enum', enum: ProFormaEstado, default: ProFormaEstado.ACTIVA })
  estado!: ProFormaEstado;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  fechaEmision!: Date;

  @Column({ type: 'timestamp', nullable: true })
  fechaVencimiento?: Date;

  @OneToMany(() => ProFormaItem, item => item.proForma, { cascade: true, eager: true })
  items!: ProFormaItem[];
}
