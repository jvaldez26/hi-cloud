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

  // ── Descuento por línea — mismo contrato que factura_detalles ─────────────
  // Convención A: precioUnitario BRUTO, descuentoMonto = total de la línea.
  // Convención B (POS): precioOriginal presente, precio ya NETO, descuentoMonto
  // POR UNIDAD. Lo calcula common/calculo/descuento-documento.ts, el mismo
  // helper que la factura.
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuentoPct!: number;

  /** Descuento en BASE IMPONIBLE. 4 decimales: sale de dividir entre 1 + ITBIS. */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  descuentoMonto!: number;

  /** Precio bruto por unidad antes del descuento. Presente ⇒ convención B. */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  precioOriginal?: number;
}
