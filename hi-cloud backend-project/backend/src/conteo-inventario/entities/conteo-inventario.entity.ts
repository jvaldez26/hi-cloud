import {
  Entity, Column, ManyToOne, JoinColumn, OneToMany, Index,
} from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';
import { Almacen } from '../../almacenes/entities/almacen.entity';
import { User } from '../../users/users.entity';
import { LineaConteo } from './linea-conteo.entity';

// Union types — el compilador atrapa valores inválidos antes que el CHECK en DB
// 'proveedor' requiere campo proveedorId en productos (no existe aún).
// 'ciclico_abc' requiere clasificación ABC y fecha de último conteo por producto.
// Ambos se agregan al tipo y al DB cuando los datos estén en el esquema.
export type ConteoTipo =
  | 'total' | 'ubicacion' | 'categoria' | 'selectivo' | 'marca';

export type ConteoModalidad = 'ciego' | 'informado';

export type ConteoEstado =
  | 'borrador' | 'en_conteo' | 'en_digitacion' | 'en_revision'
  | 'ajustado' | 'cerrado' | 'anulado';

export type ConteoUmbralTipo = 'unidades' | 'valor';

@TenantScoped()
@Entity('conteos_inventario')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'almacenId'])
export class ConteoInventario extends TenantBaseEntity {
  @Column({ length: 20 })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ length: 30, default: 'total' })
  tipo!: ConteoTipo;

  @Column({ length: 20, default: 'ciego' })
  modalidad!: ConteoModalidad;

  @Column({ length: 20, default: 'borrador' })
  estado!: ConteoEstado;

  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacenId' })
  almacen!: Almacen;

  @Column()
  almacenId!: number;

  // { categorias: string[], ubicacionIds: number[], proveedorIds: number[], ... }
  @Column({ type: 'jsonb', nullable: true })
  filtros?: Record<string, unknown> | null;

  @Column({ length: 10, default: 'unidades' })
  umbralTipo!: ConteoUmbralTipo;

  // AVISO: TypeORM devuelve columnas DECIMAL como string desde el driver pg.
  // En el service: Number(conteo.umbralValor) antes de comparar.
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 5 })
  umbralValor!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fechaGeneracion!: Date;

  // Cierre de la ventana de movimientosVentana. El usuario lo fija al iniciar el conteo
  // (por defecto = fechaGeneracion). Separado de contadaEn porque la digitación puede
  // ocurrir horas después del conteo físico real.
  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fechaCorteConteo!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaInicio!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'generadoPorId' })
  generadoPor!: User;

  @Column()
  generadoPorId!: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'cerradoPorId' })
  cerradoPor!: User | null;

  @Column({ nullable: true })
  cerradoPorId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'ajustadoPorId' })
  ajustadoPor!: User | null;

  @Column({ nullable: true })
  ajustadoPorId!: number | null;

  @Column({ type: 'int', default: 0 })
  totalLineas!: number;

  @Column({ type: 'int', default: 0 })
  lineasContadas!: number;

  @Column({ type: 'int', default: 0 })
  totalDiferencias!: number;

  // AVISO: TypeORM devuelve DECIMAL como string — Number(conteo.valorDiferencia).
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  valorDiferencia!: string;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @OneToMany(() => LineaConteo, linea => linea.conteo, { cascade: false })
  lineas?: LineaConteo[];
}
