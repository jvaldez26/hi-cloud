import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { CotizacionProveedor } from './cotizacion-proveedor.entity';

@Entity('cotizacion_proveedor_lineas')
export class CotizacionProveedorLinea extends TenantBaseEntity {
  @ManyToOne(() => CotizacionProveedor, (c) => c.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cotizacionId' })
  cotizacion!: CotizacionProveedor;

  @Column()
  cotizacionId!: number;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeItbis!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  @Column({ length: 100, nullable: true })
  unidad?: string;
}
