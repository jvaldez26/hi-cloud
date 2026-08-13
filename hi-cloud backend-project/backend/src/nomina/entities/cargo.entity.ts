import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('cargos')
@Index(['empresaId', 'isActive'])
export class Cargo extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;
}
