import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoCuenta {
  ACTIVO     = 'activo',
  PASIVO     = 'pasivo',
  PATRIMONIO = 'patrimonio',
  INGRESO    = 'ingreso',
  COSTO      = 'costo',
  GASTO      = 'gasto',
}

export enum NaturalezaCuenta {
  DEUDORA   = 'deudora',   // activos, costos, gastos
  ACREEDORA = 'acreedora', // pasivos, patrimonio, ingresos
}

/**
 * Anexo del IR-2 (Declaración Jurada de ISR) al que esta cuenta aporta su
 * saldo — Fase 1 del catálogo fiscal dominicano (ver material de
 * capacitación del Lic. Wilton Andrés Pérez, "Gastos del 606 vs IR-2").
 */
export enum AnexoIR2 {
  A1 = 'A1', // Balance General
  B1 = 'B1', // Estado de Resultados
  D  = 'D',  // Costo de Venta
}

/**
 * Tipos de cuenta coherentes con cada anexo del IR-2 — corrección del
 * 2026-09-19: A1/B1 son anexos de BALANCE/RESULTADOS respectivamente, así
 * que restringirlos a "gasto o costo" (como sí aplica a tipoGasto606 y
 * requiereNCF, que son del 606) dejaba a ninguna cuenta real poder llevar
 * A1. anexoIR2/casillaIR2 se validan contra ESTA tabla, no contra
 * "gasto/costo" — el Anexo D en particular toca cuentas de tipo activo
 * (Inventario Inicial/Final) además de costo (Compras/Costo de Venta), ver
 * el material de capacitación del Lic. Wilton Andrés Pérez.
 */
export const TIPOS_POR_ANEXO_IR2: Record<AnexoIR2, TipoCuenta[]> = {
  [AnexoIR2.A1]: [TipoCuenta.ACTIVO, TipoCuenta.PASIVO, TipoCuenta.PATRIMONIO],
  [AnexoIR2.B1]: [TipoCuenta.INGRESO, TipoCuenta.COSTO, TipoCuenta.GASTO],
  [AnexoIR2.D]:  [TipoCuenta.ACTIVO, TipoCuenta.COSTO],
};

@TenantScoped()
@Entity('cuentas_contables')
export class CuentaContable extends TenantBaseEntity {
  @Column({ length: 20 })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'enum', enum: TipoCuenta })
  tipo!: TipoCuenta;

  @Column({ type: 'enum', enum: NaturalezaCuenta })
  naturaleza!: NaturalezaCuenta;

  @Column({ type: 'int' })
  nivel!: number;

  @Column({ default: false })
  permiteMovimientos!: boolean;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaPadreId' })
  cuentaPadre?: CuentaContable;

  @Column({ nullable: true })
  cuentaPadreId?: number;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  // ── Etiquetas fiscales (Fase 1 — catálogo fiscal dominicano) ─────────────
  // Todas solo tienen sentido en cuentas de movimiento (permiteMovimientos=
  // true) — las de agrupación no reciben asientos y no se etiquetan. La
  // restricción de TIPO difiere por etiqueta (validado en
  // ContabilidadService, no aquí):
  //   - tipoGasto606/requiereNCF: solo gasto o costo — el 606 declara
  //     compras y gastos, no partidas de balance.
  //   - anexoIR2/casillaIR2: cualquier tipo, pero coherente con
  //     TIPOS_POR_ANEXO_IR2 (A1 es balance, B1 es resultados, D toca activo
  //     y costo).

  /** Uno de los 11 códigos del Formato 606 (TIPOS_BIENES_606), '01' a '11'. Solo gasto/costo. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  tipoGasto606?: string;

  /**
   * Anexo del IR-2 al que aporta esta cuenta ('A1'/'B1'/'D' — ver AnexoIR2 y
   * TIPOS_POR_ANEXO_IR2). varchar y no un enum nativo de Postgres, a
   * propósito: mismo criterio que tipoBienes/formaPago en compras (códigos
   * DGII validados a nivel de app contra una constante, no por el motor de
   * base de datos).
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  anexoIR2?: AnexoIR2;

  /**
   * Línea/casilla del anexo, ej. '6.1', '7.5', '9.1', '11.1' para A1/B1; en
   * D, un código corto legible (ver constants/dgii-606.ts en el frontend —
   * el Anexo D no trae numeración oficial confirmada todavía, eso se
   * verifica en Fase 3). Texto libre a nivel de columna — la app ofrece un
   * selector acotado según tipo cuando anexoIR2='D', pero no lo valida
   * aquí: adivinar semántica de cuenta (¿esta "activo" es Inventario o
   * Caja?) queda fuera de esta fase.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  casillaIR2?: string;

  /**
   * true = el gasto necesita NCF para ser deducible; false = va sin NCF
   * (nómina y derivados de TSS, aportaciones a pensiones/salud/riesgo
   * laboral/INFOTEP, depreciación, destrucción de inventario autorizada
   * por DGII). Un gasto sin NCF nunca aparece en el 606 pero sí en el
   * IR-2 — si esta bandera se etiqueta mal, el cruce fiscal no cuadra.
   * Solo gasto/costo, igual que tipoGasto606.
   */
  @Column({ type: 'boolean', nullable: true })
  requiereNCF?: boolean;
}
