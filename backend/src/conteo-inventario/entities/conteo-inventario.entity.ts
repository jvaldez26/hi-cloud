import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { LineaConteo } from './linea-conteo.entity';

export enum EstadoConteo {
  BORRADOR     = 'borrador',
  EN_PROCESO   = 'en_proceso',
  CONFIRMADO   = 'confirmado',
  CANCELADO    = 'cancelado',
}

@Entity('conteos_inventario')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class ConteoInventario extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'enum', enum: EstadoConteo, default: EstadoConteo.BORRADOR })
  estado!: EstadoConteo;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ length: 100, nullable: true })
  categoria?: string;

  @OneToMany(() => LineaConteo, l => l.conteo, { cascade: true, eager: false })
  lineas!: LineaConteo[];

  @Column({ type: 'int', default: 0 })
  totalProductos!: number;

  @Column({ type: 'int', default: 0 })
  totalDiferencias!: number;

  @Column()
  usuarioId!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
