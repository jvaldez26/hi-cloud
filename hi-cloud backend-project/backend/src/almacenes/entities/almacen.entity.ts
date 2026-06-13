import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('almacenes')
export class Almacen extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 20, nullable: true })
  codigo?: string;

  @Column({ length: 200, nullable: true })
  direccion?: string;

  @Column({ length: 100, nullable: true })
  ciudad?: string;

  @Column({ length: 100, nullable: true })
  responsable?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
