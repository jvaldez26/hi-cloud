import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Un ciclo de facturación de una empresa, a efectos de cuota de e-CF.
 *
 * NO es el contador: el consumo se cuenta con `COUNT(*)` sobre `ecf` acotado al
 * ciclo, porque una fila de `ecf` es exactamente una secuencia consumida y el
 * resultado de un ciclo cerrado no cambia nunca. Aquí vive solo lo que no se
 * puede recomputar — los avisos ya enviados y, si se cobró, el recibo congelado.
 *
 * Sin `@TenantScoped`: es una tabla de cobros que el super admin consulta a
 * través de todas las empresas, como `suscripciones`.
 *
 * Ver la migración `1761800000000-CrearCuotaEcf` para el porqué de cada regla.
 */
@Entity('ecf_consumo_ciclo')
@Index(['empresaId', 'cicloInicio'], { unique: true })
export class EcfConsumoCiclo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  /** Primer día del ciclo, INCLUSIVO. */
  @Column({ type: 'date' })
  cicloInicio!: string;

  /** Primer día del ciclo siguiente, EXCLUSIVO. */
  @Column({ type: 'date' })
  cicloFin!: string;

  // ── Avisos al cliente (idempotencia) ───────────────────────────────────────
  // Sin estas marcas, la empresa que emite 300 e-CF en un día manda 300 correos.

  @Column({ type: 'timestamptz', nullable: true })
  aviso80EnviadoEn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  aviso100EnviadoEn?: Date | null;

  // ── Recibo del cargo — todo null hasta que el super admin lo pulsa ─────────

  /** Plan vigente al COBRAR, no al abrir el ciclo: un upgrade a mitad de ciclo da el cupo nuevo entero. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  planCobrado?: string | null;

  @Column({ type: 'int', nullable: true })
  cupoCobrado?: number | null;

  @Column({ type: 'int', nullable: true })
  emitidosCobrados?: number | null;

  /** Precio vigente en el momento del cargo. Cambiarlo después NO reprecia esto. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  precioUnitario?: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  monto?: number | null;

  /** → `pagos_suscripcion.id`. Su presencia es lo que marca el ciclo como cobrado. */
  @Column({ type: 'int', nullable: true })
  cargoId?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  cobradoEn?: Date | null;

  /** userId del super admin que generó el cargo (criterio S-64: autoría). */
  @Column({ type: 'int', nullable: true })
  cobradoPor?: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
