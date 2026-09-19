import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';
import { CuentaContable, AnexoIR2 } from './cuenta-contable.entity';

/**
 * FASE 4 Bloque A del catálogo fiscal dominicano — anexoIR2/casillaIR2 dejan
 * de ser columnas únicas en CuentaContable y pasan a esta relación: una
 * cuenta puede aportar su saldo a MÁS DE UN anexo del IR-2 a la vez. Esto no
 * es una excepción, es la norma — el caso de referencia son las 4 cuentas de
 * Inventario, que van al Anexo A1 (su saldo de cierre es parte del Balance
 * General) Y al Anexo D (su saldo inicial/final es justo lo que ese anexo
 * pide) simultáneamente. Con la columna única que existía hasta Fase 3,
 * etiquetar una perdía la otra en silencio — por eso esas 4 cuentas se
 * quedaron sin ninguna etiqueta desde Fase 2 hasta ahora.
 *
 * Una cuenta no puede repetir el mismo anexoIR2 dos veces (validado en
 * ContabilidadService, no aquí) — un anexo, una casilla por cuenta; lo que sí
 * puede repetirse es la MISMA cuenta apareciendo en varios anexos distintos.
 */
@TenantScoped()
@Entity('cuenta_anexo_ir2')
@Index(['cuentaContableId'])
export class CuentaAnexoIR2 extends TenantBaseEntity {
  @ManyToOne(() => CuentaContable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuentaContableId' })
  cuenta?: CuentaContable;

  @Column()
  cuentaContableId!: number;

  /** 'A1' Balance General, 'B1' Estado de Resultados, 'D' Costo de Venta — ver TIPOS_POR_ANEXO_IR2. */
  @Column({ type: 'varchar', length: 2 })
  anexoIR2!: AnexoIR2;

  /**
   * Línea/casilla del anexo — texto libre para A1/B1 (ej. '6.1', '9.1'), o
   * uno de los slugs cortos que ofrece el selector de D (ver
   * CASILLAS_ANEXO_D en PlanCuentasPage.tsx). No hay números de casilla de
   * DGII verificados a nivel de columna — se valida en la app, no aquí.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  casillaIR2?: string;
}
