import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 del catálogo fiscal dominicano — aplica la plantilla de etiquetas
 * fiscales (ver PLAN_CUENTAS/etiquetarFiscalmente() en
 * contabilidad.service.ts) a las cuentas que YA existen en producción, por
 * `codigo` (el catálogo es 100% idéntico al seed en las 35 empresas que
 * tienen cuentas_contables, según el diagnóstico de Fase 2 del
 * 2026-09-19 — no hace falta pantalla de mapeo por empresa).
 *
 * Reglas de esta migración (idénticas a las del seed, para que una cuenta
 * nueva y una vieja terminen igual):
 * - Solo escribe donde la columna está en NULL — si alguien ya clasificó
 *   una cuenta a mano (o una corrida anterior de esta misma migración ya la
 *   tocó), no la pisa. Correrla dos veces no cambia nada (idempotente).
 * - No filtra por empresaId: aplica por igual a las 35 empresas con
 *   catálogo y a las filas con empresaId NULL (ver hallazgo de Fase 2,
 *   pendiente de investigar aparte — no se corrige aquí).
 * - "ITBIS no Recuperable" (6.1.2.06) no aparece en ninguna de las 3
 *   listas: es la única cuenta genuinamente ambigua del seed, queda sin
 *   ninguna etiqueta a propósito hasta que se confirme con el contador.
 * - Las 4 cuentas de Inventario (1.1.3.01-04) no aparecen en la lista de
 *   anexoIR2: alimentan A1 (Balance) Y D (Anexo D) a la vez, y la columna
 *   solo admite un valor — se dejan sin anexo en vez de elegir uno y
 *   perder el otro en silencio.
 * - casillaIR2 no se toca: no hay números de casilla de DGII verificados
 *   todavía (gate de la Fase 3, no una omisión de esta migración).
 * - No renumera ni siembra cuentas — solo actualiza columnas de filas que
 *   ya existen.
 */
export class EtiquetarCuentasFiscalesSeed1764300000000 implements MigrationInterface {
  name = 'EtiquetarCuentasFiscalesSeed1764300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // ── tipoGasto606 — 13 de las 14 cuentas de gasto/costo de movimiento ──
    await queryRunner.query(`
      UPDATE cuentas_contables cc
      SET "tipoGasto606" = v.codigo_606
      FROM (VALUES
        ('6.1.1.01','01'), ('6.1.1.02','01'), ('6.1.1.03','01'),
        ('6.1.2.01','03'),
        ('6.1.2.02','02'), ('6.1.2.03','02'), ('6.1.2.04','02'),
        ('6.1.2.05','04'), ('6.2.1.01','04'),
        ('6.1.3.01','07'), ('6.1.3.02','07'),
        ('5.1.1.01','09'), ('5.1.1.02','09')
      ) AS v(codigo, codigo_606)
      WHERE cc.codigo = v.codigo AND cc."tipoGasto606" IS NULL
    `);

    // ── anexoIR2 — 39 de las 44 cuentas de movimiento (todas menos las 4 de Inventario + ITBIS no Recuperable) ──
    await queryRunner.query(`
      UPDATE cuentas_contables cc
      SET "anexoIR2" = v.anexo
      FROM (VALUES
        -- Balance General (A1) — activo, pasivo, patrimonio (menos Inventario)
        ('1.1.1.01','A1'), ('1.1.1.02','A1'), ('1.1.1.03','A1'),
        ('1.1.2.01','A1'), ('1.1.2.02','A1'),
        ('1.1.4.01','A1'),
        ('1.2.1.01','A1'), ('1.2.1.02','A1'), ('1.2.1.03','A1'), ('1.2.2.01','A1'),
        ('2.1.1.01','A1'), ('2.1.2.01','A1'), ('2.1.2.02','A1'), ('2.1.2.03','A1'),
        ('2.1.3.01','A1'), ('2.1.3.02','A1'), ('2.1.5.01','A1'), ('2.1.6.01','A1'), ('2.2.1.01','A1'),
        ('3.1.1.01','A1'), ('3.2.1.01','A1'), ('3.2.1.02','A1'),
        -- Estado de Resultados (B1) — ingreso y gasto (menos ITBIS no Recuperable)
        ('4.1.1.01','B1'), ('4.1.1.02','B1'), ('4.2.1.01','B1'), ('4.2.1.02','B1'),
        ('6.1.1.01','B1'), ('6.1.1.02','B1'), ('6.1.1.03','B1'),
        ('6.1.2.01','B1'), ('6.1.2.02','B1'), ('6.1.2.03','B1'), ('6.1.2.04','B1'), ('6.1.2.05','B1'),
        ('6.2.1.01','B1'), ('6.1.3.01','B1'), ('6.1.3.02','B1'),
        -- Costo de Venta (D) — costo
        ('5.1.1.01','D'), ('5.1.1.02','D')
      ) AS v(codigo, anexo)
      WHERE cc.codigo = v.codigo AND cc."anexoIR2" IS NULL
    `);

    // ── requiereNCF — 9 de las 14 cuentas de gasto/costo (las 5 restantes quedan sin dictamen) ──
    await queryRunner.query(`
      UPDATE cuentas_contables cc
      SET "requiereNCF" = v.requiere_ncf
      FROM (VALUES
        ('6.1.1.01', false), ('6.1.1.02', false), ('6.1.1.03', false),
        ('6.1.2.05', false), ('6.2.1.01', false),
        ('6.1.2.01', true),  ('6.1.2.02', true), ('6.1.2.03', true), ('6.1.2.04', true)
      ) AS v(codigo, requiere_ncf)
      WHERE cc.codigo = v.codigo AND cc."requiereNCF" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No reversible sin riesgo: para el momento en que alguien revierta esta
    // migración, es posible que ya se hayan hecho ediciones manuales sobre
    // estas mismas cuentas (vía el modal de PlanCuentasPage.tsx) — un DOWN
    // que pusiera todo en NULL otra vez borraría ese trabajo humano sin
    // forma de distinguirlo del que puso esta migración. Se deja como
    // no-op intencional, mismo criterio que otras migraciones de datos de
    // este repo (ver 1755620000000-AddImportacionEnum.ts).
  }
}
