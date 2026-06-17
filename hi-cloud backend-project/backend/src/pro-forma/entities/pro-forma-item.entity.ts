import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';
import { ProForma } from './pro-forma.entity';

@TenantScoped()
@Entity('pro_forma_items')
export class ProFormaItem extends TenantBaseEntity {
  @Column()
  proFormaId!: number;

  @ManyToOne(() => ProForma, pf => pf.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proFormaId' })
  proForma!: ProForma;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 255 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  precio!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeItbis!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: number;
}
