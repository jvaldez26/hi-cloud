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
 * Estado de Resultados (2026-09-21) — clasificación operacional/no
 * operacional de una cuenta de ingreso/costo/gasto, para separar
 * "Ingresos"/"Gastos" de "Otros Ingresos"/"Otros Gastos" SIN usar rangos de
 * código (el código '4.1'/'4.2' existe en el catálogo pero no es una fuente
 * de verdad limpia — ver 'Gastos Financieros', que vive bajo '6.1'
 * "Operacionales" aunque contablemente es no operacional).
 *
 * NULLABLE — null significa "hereda de la cuenta madre" (ver
 * resolverClasificacionResultado() en reportes-financieros): así basta
 * marcar UNA cuenta madre para que todas sus hijas queden clasificadas, sin
 * tener que etiquetar cuenta por cuenta. Sin valor en toda la cadena hasta
 * la raíz → 'operacional' (default). Solo tiene sentido para ingreso/costo/
 * gasto — en activo/pasivo/patrimonio se ignora.
 */
export enum ClasificacionResultado {
  OPERACIONAL    = 'operacional',
  NO_OPERACIONAL = 'no_operacional',
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

  @Column({ type: 'enum', enum: ClasificacionResultado, nullable: true })
  clasificacionResultado?: ClasificacionResultado;

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
  // true) — las de agrupación no reciben asientos y no se etiquetan.
  //   - tipoGasto606/requiereNCF: solo gasto o costo — el 606 declara
  //     compras y gastos, no partidas de balance. Siguen siendo columnas
  //     únicas: una cuenta de gasto/costo tiene un único código 606.
  //   - anexoIR2/casillaIR2: FASE 4 Bloque A — dejaron de ser columnas
  //     aquí. Una cuenta puede aportar a MÁS DE UN anexo del IR-2 a la vez
  //     (las 4 cuentas de Inventario van a A1 Y a D) — eso pasó a la
  //     relación CuentaAnexoIR2 (`cuenta_anexo_ir2`, ver esa entidad).

  /** Uno de los 11 códigos del Formato 606 (TIPOS_BIENES_606), '01' a '11'. Solo gasto/costo. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  tipoGasto606?: string;

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

  /**
   * P3 Bloque 4 — cuenta que el motor de asientos automáticos referencia
   * por código (ver COD.* en asientos-automaticos.service.ts). Si un
   * contador le cambia el código a una de estas, ese tipo de asiento deja
   * de encontrar la cuenta y muere en silencio para toda la empresa —
   * "cuenta no encontrada" ya se reporta a Sentry, pero el daño (ventas o
   * compras sin asiento) ya está hecho. Nunca se expone en los DTO de
   * crear/editar cuenta: solo el seed y la migración de datos la marcan;
   * ContabilidadService bloquea editar el código y desactivar estas
   * cuentas, pero el nombre y la descripción siguen siendo libres.
   */
  @Column({ default: false })
  esCuentaSistema!: boolean;
}
