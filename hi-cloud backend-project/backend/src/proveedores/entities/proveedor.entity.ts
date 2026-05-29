import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('proveedores')
@Index(['empresaId', 'isActive'])
export class Proveedor extends TenantBaseEntity {
  @Column({ length: 200 })
  nombre!: string;

  @Column({ length: 11, nullable: true })
  rnc?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ length: 300, nullable: true })
  direccion?: string;

  @Column({ length: 100, nullable: true })
  contacto?: string;

  @Column({ length: 100, nullable: true })
  categoria?: string;

  @Column({ type: 'int', nullable: true })
  diasPago?: number;

  @Column({ length: 100, nullable: true })
  banco?: string;

  @Column({ length: 30, nullable: true })
  cuentaBancaria?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  /** Proveedor sin RNC (persona física o negocio informal) — genera E41 en compras */
  @Column({ type: 'boolean', nullable: true, default: false })
  esInformal?: boolean;
}
