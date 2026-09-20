import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum EstadoParametroFiscal {
  VALIDADO             = 'VALIDADO',
  PENDIENTE_VALIDACION = 'PENDIENTE_VALIDACION',
}

/**
 * Parámetro fiscal (2026-09-20) — tabla GLOBAL, sin empresaId: una tasa, un
 * tramo o una regla de la DGII es la misma para todas las empresas, nunca
 * un dato de tenant. Alimenta las calculadoras de Herramientas Fiscales y,
 * más adelante, reemplaza las tasas hoy hardcodeadas en isr.service.ts y
 * nomina-calculos.service.ts (no migradas en esta tarea — ver el
 * diagnóstico del Paso 0).
 *
 * Vigencia por fecha, nunca edición en sitio: `resolver(clave, fecha)`
 * busca la fila cuyo rango [vigenciaDesde, vigenciaHasta] cubre esa fecha.
 * Cambiar un valor es CERRAR la fila vigente (vigenciaHasta = día anterior)
 * y crear una nueva — así una consulta histórica (una compra de hace dos
 * años) siempre resuelve el parámetro que regía ENTONCES, no el de hoy.
 * El índice único parcial de la migración (WHERE "vigenciaHasta" IS NULL)
 * hace cumplir a nivel de base de datos que solo puede haber una fila
 * abierta por clave.
 *
 * `valor` es jsonb y puede ser NULL — así se ve un parámetro
 * PENDIENTE_VALIDACION del que todavía no se conoce el número real: existe
 * el registro (con su base legal y su fuente), pero ninguna calculadora
 * puede usarlo hasta que alguien lo valide. `resolver()` lanza un error
 * explícito en ese caso, nunca deja que un `null` se cuele en una cuenta.
 */
@Entity('parametros_fiscales')
export class ParametroFiscal {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ length: 80 })
  clave!: string;

  @Column({ type: 'jsonb', nullable: true })
  valor!: Record<string, unknown> | number | string | null;

  @Column({ type: 'date' })
  vigenciaDesde!: string;

  @Column({ type: 'date', nullable: true })
  vigenciaHasta?: string | null;

  @Column({ type: 'text' })
  baseLegal!: string;

  @Column({ type: 'text' })
  fuente!: string;

  @Column({ type: 'varchar', length: 30, default: EstadoParametroFiscal.PENDIENTE_VALIDACION })
  estado!: EstadoParametroFiscal;

  @Column({ nullable: true })
  validadoPor?: number;

  @Column({ type: 'timestamp', nullable: true })
  validadoEn?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
