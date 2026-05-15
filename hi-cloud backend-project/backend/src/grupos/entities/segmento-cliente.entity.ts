import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('segmentos_cliente')
@Index(['empresaId', 'isActive'])
export class SegmentoCliente extends TenantBaseEntity {
  @Column({ length: 10 })
  codigo!: string;

  @Column({ length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuentoPct!: number;

  @Column({ type: 'int', default: 30 })
  diasCreditoDefault!: number;

  @Column({ default: true })
  activo!: boolean;
}
