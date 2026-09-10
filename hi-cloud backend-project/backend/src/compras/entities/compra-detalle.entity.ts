import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { Compra } from './compra.entity';

@Entity('compra_detalles')
export class CompraDetalle extends BaseEntity {
  @ManyToOne(() => Compra, (c) => c.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compraId' })
  compra!: Compra;

  @Column()
  compraId!: number;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precioUnitario!: number;

  /** Unidades que se pagan — base del valor fiscal */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  /** Unidades bonificadas (regaladas) — no suman al monto a pagar */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadBonificada!: number;

  /** Total al inventario = cantidad + cantidadBonificada */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadTotal!: number;

  /** Unidades efectivamente recibidas (null = pendiente de recepción) */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  cantidadRecibida?: number;

  /**
   * Costo real por unidad = subtotal (ya NETO de descuento) ÷ cantidadTotal
   * (precio proveedor para AVCO). El descuento SÍ entra aquí — es lo que
   * hace que el costo que ve inventario sea el que de verdad se pagó.
   */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  costoUnitarioReal?: number;

  /**
   * Suma de montoUnitario de todos los GastoImportacionLinea aplicados a esta línea.
   * costoUnitarioReal + costoImportacionUnitario = costo landing real → AVCO.
   */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costoImportacionUnitario!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeItbis!: number;

  /**
   * Descuento POR LÍNEA — solo ayuda de captura (%), nunca se usa para
   * calcular. Lo que decide todo cálculo es descuentoMonto.
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuentoPct!: number;

  /**
   * Descuento en BASE (pre-ITBIS): a diferencia de facturas (POS), aquí NO
   * se convierte desde pesos finales — la OC no lleva ITBIS ya incluido en
   * el precio, así que lo que se teclea o deriva de descuentoPct es
   * directamente la base a restar. 4 decimales por si sale de un %.
   */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  descuentoMonto!: number;

  /** Base gravable de la línea = (precioUnitario × cantidad) − descuentoMonto */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  importeItbis!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;
}
