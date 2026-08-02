import {
  Entity, Column, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';
import { ConteoInventario } from './conteo-inventario.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { User } from '../../users/users.entity';
import { UbicacionAlmacen } from '../../wms/entities/ubicacion-almacen.entity';

export type LineaEstado = 'pendiente' | 'contada' | 'en_recuento' | 'conciliada';

@TenantScoped()
@Entity('lineas_conteo')
@Index(['empresaId', 'conteoId'])
@Index(['empresaId', 'isActive'])
@Index(['conteoId', 'orden'])
@Index(['empresaId', 'productoId'])
@Index(['empresaId', 'estadoLinea'])
export class LineaConteo extends TenantBaseEntity {
  @ManyToOne(() => ConteoInventario, c => c.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conteoId' })
  conteo!: ConteoInventario;

  @Column()
  conteoId!: number;

  @Column({ type: 'int' })
  orden!: number;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  // Snapshot desnormalizado (no actualizar retroactivamente)
  @Column({ length: 30, nullable: true })
  productoCodigo!: string | null;

  @Column({ length: 200, nullable: true })
  productoNombre!: string | null;

  @Column({ length: 20, nullable: true })
  unidadMedida!: string | null;

  @ManyToOne(() => UbicacionAlmacen, { nullable: true })
  @JoinColumn({ name: 'ubicacionId' })
  ubicacion!: UbicacionAlmacen | null;

  @Column({ nullable: true })
  ubicacionId!: number | null;

  @Column({ default: false })
  tieneLotes!: boolean;

  @Column({ default: false })
  tieneSeriales!: boolean;

  // AVISO: TypeORM devuelve DECIMAL como string — usar Number() en el service.
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadSistema!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  cantidadContada!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  cantidadRecuento!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  diferencia!: string;

  // Delta neto de movimientos entre fechaGeneracion del conteo y contadaEn de esta línea.
  // Suma de (cantidadNueva - cantidadAnterior) de TODOS los tipos de movimiento.
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  movimientosVentana!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costoUnitario!: string;

  @Column({ length: 20, default: 'pendiente' })
  estadoLinea!: LineaEstado;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'contadaPorId' })
  contadaPor!: User | null;

  @Column({ nullable: true })
  contadaPorId!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  contadaEn!: Date | null;

  // Quien hizo el recuento físico (puede ser distinto al capturador original)
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recuentadoPorId' })
  recuentadoPor!: User | null;

  @Column({ nullable: true })
  recuentadoPorId!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  recuentadaEn!: Date | null;

  @Column({ type: 'text', nullable: true })
  nota!: string | null;
}
