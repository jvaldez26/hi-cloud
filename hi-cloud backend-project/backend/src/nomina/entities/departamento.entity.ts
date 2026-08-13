import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('departamentos')
@Index(['empresaId', 'isActive'])
export class Departamento extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;
}
