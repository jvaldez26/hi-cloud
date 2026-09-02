import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Parámetros de cobro que el super admin cambia sin desplegar. Fila única (id=1).
 *
 * No vive en `configuraciones_sistema` a propósito: aquel `PATCH` está abierto a
 * `UserRole.ADMIN` —el admin de cualquier empresa cliente— sobre una tabla sin
 * `empresaId`, así que un cliente podría bajarse el precio de su propio
 * excedente. Esta se toca solo desde Super Admin y queda auditada, igual que el
 * precio de los planes (`plan_configuracion`).
 *
 * Cuando haga falta un precio por plan: columna nullable `precioEcfExcedente` en
 * `plan_configuracion`, y gana la del plan cuando esté puesta. Nada que migrar.
 */
@Entity('configuracion_cobros')
export class ConfiguracionCobros {
  @PrimaryColumn({ type: 'int', default: 1 })
  id!: number;

  /**
   * RD$ por cada e-CF por encima del cupo del plan.
   *
   * 0 significa SIN CONFIGURAR, no gratis: mientras valga 0 el panel no deja
   * generar cargos y lo dice. Mismo criterio que `sinPrecio` en el preview de
   * pago — sin precio no se afirma nada, en vez de prometer un número falso.
   */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  precioEcfExcedente!: number;

  /** userId del super admin que lo cambió por última vez. */
  @Column({ type: 'int', nullable: true })
  actualizadoPor?: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
