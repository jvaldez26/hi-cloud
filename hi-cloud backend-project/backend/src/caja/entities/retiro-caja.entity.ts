import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum CategoriaRetiro {
  PAGO_PROVEEDOR = 'pago_proveedor',
  DEPOSITO_BANCO = 'deposito_banco',
  GASTO          = 'gasto',
  PRESTAMO_DUENO = 'prestamo_dueno',
  OTRO           = 'otro',
}

export enum EstadoRetiro {
  ACTIVO    = 'activo',
  PENDIENTE = 'pendiente',
  ANULADO   = 'anulado',
}

export const CATEGORIA_LABELS: Record<CategoriaRetiro, string> = {
  pago_proveedor: 'Pago a proveedor',
  deposito_banco: 'Depósito a banco',
  gasto:          'Gasto operacional',
  prestamo_dueno: 'Préstamo al dueño',
  otro:           'Otro',
};

@Entity('retiros_caja')
export class RetiroCaja {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column()
  cajaDiariaId!: number;

  @Column()
  usuarioId!: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  usuarioNombre?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'varchar', length: 300 })
  descripcion!: string;

  /** Tipo de egreso — permite conciliar y reportar por categoría */
  @Column({ type: 'varchar', length: 30, default: CategoriaRetiro.OTRO })
  categoria!: CategoriaRetiro;

  /** activo = aprobado y vigente | pendiente = requiere autorización | anulado = revertido */
  @Column({ type: 'varchar', length: 20, default: EstadoRetiro.ACTIVO })
  estado!: EstadoRetiro;

  // ── Traza de autorización ────────────────────────────────────────────────
  @Column({ type: 'integer', nullable: true })
  autorizadorId?: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  autorizadorNombre?: string;

  @Column({ type: 'timestamptz', nullable: true })
  autorizadoEn?: Date;

  // ── Traza de anulación ───────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 500, nullable: true })
  motivoAnulacion?: string;

  @Column({ type: 'integer', nullable: true })
  anuladoPorId?: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  anuladoPorNombre?: string;

  @Column({ type: 'timestamptz', nullable: true })
  anuladoEn?: Date;

  /** Vínculo opcional al módulo de Bancos (solo cuando categoria = deposito_banco) */
  @Column({ type: 'integer', nullable: true })
  cuentaBancariaId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
