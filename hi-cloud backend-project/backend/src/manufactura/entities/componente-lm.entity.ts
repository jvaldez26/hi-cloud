import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ListaMateriales } from './lista-materiales.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('componentes_lm')
export class ComponenteLM extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  listaId!: number;

  @ManyToOne(() => ListaMateriales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listaId' })
  lista!: ListaMateriales;

  @Column()
  productoId!: number;   // materia prima o semielaborado

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ length: 20, default: 'PZA' })
  unidad!: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ type: 'int', default: 0 })
  orden!: number;
}
