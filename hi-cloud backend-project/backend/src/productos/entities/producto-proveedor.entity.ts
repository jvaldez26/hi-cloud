import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';
import { Producto } from './producto.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';

/**
 * De dónde salió la fila. No es metadato decorativo: gobierna el backfill.
 *
 *   'backfill' — derivada del historial de compras en la migración inicial.
 *   'compra'   — creada sola al recibir una compra (mecanismo permanente).
 *   'manual'   — la dio de alta una persona. NUNCA la pisa un proceso automático.
 *
 * La distinción importa sobre todo para el precio: un costo histórico NO es un
 * precio pactado, es una pista. Mientras el origen no sea 'manual', la pantalla
 * lo presenta como «último costo» y no como un compromiso del proveedor.
 */
export type OrigenProductoProveedor = 'backfill' | 'compra' | 'manual';

/**
 * Qué productos vende cada proveedor.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * Hasta ahora la relación producto↔proveedor no existía en el esquema: se
 * deducía encadenando `compra_detalles → compras.proveedorId`. Eso solo puede
 * responder «qué le he comprado», y la pregunta del negocio es «qué me vende»
 * — que incluye lo que aún no le has comprado nunca, que es justo lo que uno
 * quiere pedir cuando tiene al proveedor delante en el mostrador.
 *
 * La ausencia ya había bloqueado antes el conteo de inventario por proveedor
 * (ver el comentario en conteo-inventario.entity.ts).
 */
@TenantScoped()
@Entity('producto_proveedor')
@Unique(['empresaId', 'productoId', 'proveedorId'])
@Index(['empresaId', 'proveedorId'])
@Index(['empresaId', 'productoId'])
export class ProductoProveedor extends TenantBaseEntity {
  @Column()
  productoId!: number;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoId' })
  producto?: Producto;

  @Column()
  proveedorId!: number;

  @ManyToOne(() => Proveedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proveedorId' })
  proveedor?: Proveedor;

  /**
   * Proveedor preferente para este producto.
   *
   * La unicidad NO se garantiza aquí sino con un índice único PARCIAL en la
   * migración: `UNIQUE (empresaId, productoId) WHERE "esPreferente" AND "isActive"`.
   * TypeORM no sabe expresar índices parciales de forma portable, así que vive
   * en SQL crudo — pero vive en la base de datos, que es lo que importa. Dejar
   * esta regla solo en el servicio es cómo se acaba con dos preferentes para el
   * mismo producto y nadie sabiendo cuál gana.
   */
  @Column({ type: 'boolean', default: false })
  esPreferente!: boolean;

  /** El código del artículo en el catálogo DEL PROVEEDOR, que es el que él busca. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  codigoProveedor?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  precioPactado?: number | null;

  /**
   * Moneda del precio pactado. Sin esto el precio es ambiguo desde el primer
   * registro que venga de una compra en USD — `compras` ya maneja moneda y
   * tipoCambio, así que el caso existe hoy.
   */
  @Column({ type: 'char', length: 3, default: 'DOP' })
  monedaPactada!: string;

  /**
   * Cuándo se pactó ese precio.
   *
   * Se eligió sello de fecha y NO fecha de vigencia, a propósito: un precio
   * «vigente hasta» que nadie actualizó miente igual que uno viejo, pero con
   * más confianza. Con la fecha, la pantalla dice «pactado hace 8 meses» y el
   * que compra decide. Si hace falta vigencia algún día, se añade entonces.
   */
  @Column({ type: 'date', nullable: true })
  precioPactadoAt?: Date | null;

  /** Días que tarda en entregar. Nadie lo puede derivar del historial. */
  @Column({ type: 'int', nullable: true })
  diasEntrega?: number | null;

  /**
   * Cantidad mínima que acepta por pedido.
   *
   * Es DISTINTO de multiploEmpaque y por eso son dos columnas: «no te vendo
   * menos de 6» y «solo te lo vendo de 12 en 12» son reglas diferentes, y en
   * ferretería conviven. Con un solo campo la sugerencia redondea mal.
   *
   * NULL = sin regla. La sugerencia entonces es el faltante sin redondear.
   */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  pedidoMinimo?: number | null;

  /** Solo vende en múltiplos de esto (cajas de 12, sacos de 25 kg…). NULL = sin regla. */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  multiploEmpaque?: number | null;

  @Column({ type: 'varchar', length: 10, default: 'manual' })
  origen!: OrigenProductoProveedor;

  @Column({ type: 'text', nullable: true })
  notas?: string | null;
}
