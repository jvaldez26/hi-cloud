import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Almacen } from './almacen.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoTransferencia {
  BORRADOR   = 'borrador',
  EN_TRANSITO= 'en_transito',
  COMPLETADA = 'completada',
  CANCELADA  = 'cancelada',
}

@TenantScoped()
@Entity('transferencias_almacen')
export class TransferenciaAlmacen extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  numero!: string;

  @Column()
  almacenOrigenId!: number;

  @ManyToOne(() => Almacen, { eager: true })
  @JoinColumn({ name: 'almacenOrigenId' })
  almacenOrigen!: Almacen;

  @Column()
  almacenDestinoId!: number;

  @ManyToOne(() => Almacen, { eager: true })
  @JoinColumn({ name: 'almacenDestinoId' })
  almacenDestino!: Almacen;

  @Column()
  productoId!: number;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'enum', enum: EstadoTransferencia, default: EstadoTransferencia.BORRADOR })
  estado!: EstadoTransferencia;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ nullable: true })
  usuarioId?: number;
}
