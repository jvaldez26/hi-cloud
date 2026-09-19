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
  // Solo tienen sentido en cuentas de movimiento (permiteMovimientos=true)
  // de tipo gasto o costo — las de agrupación no reciben asientos y no se
  // etiquetan. Validado en ContabilidadService, no aquí.

  /** Uno de los 11 códigos del Formato 606 (TIPOS_BIENES_606), '01' a '11'. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  tipoGasto606?: string;

  /**
   * Anexo del IR-2 al que aporta esta cuenta ('A1'/'B1'/'D' — ver AnexoIR2).
   * varchar y no un enum nativo de Postgres, a propósito: mismo criterio que
   * tipoBienes/formaPago en compras (códigos DGII validados a nivel de app
   * contra una constante, no por el motor de base de datos).
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  anexoIR2?: AnexoIR2;

  /**
   * Línea/casilla del anexo, ej. '6.1', '7.5', '9.1', '11.1'. Texto libre:
   * DGII no numera de forma consistente entre anexos.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  casillaIR2?: string;

  /**
   * true = el gasto necesita NCF para ser deducible; false = va sin NCF
   * (nómina y derivados de TSS, aportaciones a pensiones/salud/riesgo
   * laboral/INFOTEP, depreciación, destrucción de inventario autorizada
   * por DGII). Un gasto sin NCF nunca aparece en el 606 pero sí en el
   * IR-2 — si esta bandera se etiqueta mal, el cruce fiscal no cuadra.
   */
  @Column({ type: 'boolean', nullable: true })
  requiereNCF?: boolean;
}
