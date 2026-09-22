import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/**
 * Snapshot del IT-1 calculado para un período — la única forma en que "Saldo
 * a Favor Anterior" (casilla 29) puede leer el "Nuevo Saldo a Favor" (casilla
 * 34) del mes anterior sin adivinar: getIT1() actualiza (upsert) esta fila
 * cada vez que se calcula el período, y lee la fila del mes anterior al
 * calcular casilla 29.
 *
 * No es un registro de "declaración presentada" — no hay flujo de
 * presentación ante DGII en el sistema hoy. Es el último cálculo conocido de
 * cada período, que se recalcula si los datos fuente cambian.
 */
@TenantScoped()
@Entity('declaraciones_itbis')
@Index(['empresaId', 'anio', 'mes'], { unique: true })
export class DeclaracionItbis extends TenantBaseEntity {
  @Column({ type: 'int' })
  mes!: number;

  @Column({ type: 'int' })
  anio!: number;

  /** Casilla 33 — Diferencia a Pagar del período (0 si el período cerró a favor) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  diferenciaAPagar!: number;

  /** Casilla 34 — Nuevo Saldo a Favor (lo que lee el mes siguiente como casilla 29) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  nuevoSaldoAFavor!: number;

  @Column({ type: 'timestamp', default: () => 'now()' })
  calculadoEn!: Date;
}
