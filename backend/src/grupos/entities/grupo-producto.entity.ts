import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

@Entity('grupos_producto')
@Index(['empresaId', 'isActive'])
export class GrupoProducto extends TenantBaseEntity {
  @Column({ length: 10 })
  codigo!: string;

  @Column({ length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ nullable: true })
  parentId?: number;

  @ManyToOne(() => GrupoProducto, { nullable: true, eager: false })
  @JoinColumn({ name: 'parentId' })
  parent?: GrupoProducto;

  @Column({ default: true })
  activo!: boolean;
}
