import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { SolicitudCompra } from './solicitud-compra.entity';

@Entity('solicitud_compra_lineas')
export class SolicitudCompraLinea extends TenantBaseEntity {
  @ManyToOne(() => SolicitudCompra, (s) => s.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitudId' })
  solicitud!: SolicitudCompra;

  @Column()
  solicitudId!: number;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ length: 30, default: 'UND' })
  unidad!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  presupuestoUnitario!: number;

  @Column({ type: 'text', nullable: true })
  especificaciones?: string;
}
