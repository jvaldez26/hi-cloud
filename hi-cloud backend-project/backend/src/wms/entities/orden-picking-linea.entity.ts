import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { OrdenPicking } from './orden-picking.entity';
import { Producto } from '../../productos/entities/producto.entity';

export enum EstadoLineaPicking {
  PENDIENTE  = 'pendiente',
  PICKEADO   = 'pickeado',
  FALTANTE   = 'faltante',    // no había stock en la ubicación
  PARCIAL    = 'parcial',     // se pickeó menos de lo solicitado
}

@Entity('wms_lineas_picking')
export class OrdenPickingLinea extends TenantBaseEntity {
  @ManyToOne(() => OrdenPicking, (o) => o.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordenId' })
  orden!: OrdenPicking;

  @Column()
  ordenId!: number;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ nullable: true })
  ubicacionId?: number;       // ubicación sugerida de picking

  @Column({ length: 30, nullable: true })
  ubicacionCodigo?: string;   // código de la ubicación (desnormalizado para velocidad)

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadSolicitada!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadPickeada!: number;

  @Column({ type: 'enum', enum: EstadoLineaPicking, default: EstadoLineaPicking.PENDIENTE })
  estado!: EstadoLineaPicking;

  @Column({ nullable: true })
  loteId?: number;

  @Column({ length: 100, nullable: true })
  numeroSerie?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ type: 'int', default: 0 })
  orden_linea!: number;   // orden de recogida optimizado por ubicación
}
