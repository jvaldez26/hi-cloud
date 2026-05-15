import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('programa_fidelidad')
@Index(['empresaId'])   // único por empresa a nivel de negocio, no DB unique (evita hash collision)
export class ProgramaFidelidad extends TenantBaseEntity {
  @Column({ length: 100, default: 'Programa de Puntos' })
  nombre!: string;

  // Puntos que gana el cliente por cada RD$ gastado
  @Column({ type: 'decimal', precision: 8, scale: 4, default: 1 })
  puntosPorDOP!: number;

  // Mínimo de puntos para canjear
  @Column({ type: 'int', default: 100 })
  minimoCanjePoints!: number;

  // Valor en RD$ de cada punto al canjear
  @Column({ type: 'decimal', precision: 8, scale: 4, default: 1 })
  valorPorPunto!: number;

  // Vencimiento de puntos en días (0 = nunca vencen)
  @Column({ type: 'int', default: 365 })
  diasVencimiento!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
