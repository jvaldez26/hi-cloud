import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

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

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
