import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { SolicitudCompra } from './solicitud-compra.entity';
import { CotizacionProveedorLinea } from './cotizacion-proveedor-linea.entity';

export enum EstadoCotizacionProveedor {
  BORRADOR    = 'borrador',
  ENVIADA     = 'enviada',
  RECIBIDA    = 'recibida',
  SELECCIONADA = 'seleccionada',
  RECHAZADA   = 'rechazada',
}

@Entity('cotizaciones_proveedor')
@Index(['empresaId', 'solicitudId'])
@Index(['empresaId', 'proveedorId'])
export class CotizacionProveedor extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @ManyToOne(() => SolicitudCompra, { nullable: true })
  @JoinColumn({ name: 'solicitudId' })
  solicitud?: SolicitudCompra;

  @Column({ nullable: true })
  solicitudId?: number;

  @ManyToOne(() => Proveedor, { eager: true })
  @JoinColumn({ name: 'proveedorId' })
  proveedor!: Proveedor;

  @Column()
  proveedorId!: number;

  @Column({ type: 'date' })
  fechaEnvio!: Date;

  @Column({ type: 'date', nullable: true })
  fechaRespuesta?: Date;

  @Column({ type: 'date', nullable: true })
  fechaValidez?: Date;

  @Column({ type: 'int', default: 0 })
  tiempoEntregaDias!: number;

  @Column({ length: 200, nullable: true })
  condicionesPago?: string;

  @Column({ type: 'enum', enum: EstadoCotizacionProveedor, default: EstadoCotizacionProveedor.ENVIADA })
  estado!: EstadoCotizacionProveedor;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @OneToMany(() => CotizacionProveedorLinea, (l) => l.cotizacion, { cascade: true, eager: true })
  lineas!: CotizacionProveedorLinea[];
}
