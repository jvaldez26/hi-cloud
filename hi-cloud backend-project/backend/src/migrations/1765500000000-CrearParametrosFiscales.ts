import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Herramientas Fiscales (2026-09-20) — tabla GLOBAL (sin empresaId) de
 * parámetros fiscales con vigencia por fecha. Nace para las 5 calculadoras
 * de Herramientas Fiscales, y más adelante para reemplazar las tasas hoy
 * hardcodeadas en isr.service.ts y nomina-calculos.service.ts (NO migradas
 * en esta tarea — ver el diagnóstico del Paso 0, riesgo en nómina).
 *
 * Índice único parcial sobre (clave) WHERE "vigenciaHasta" IS NULL: hace
 * cumplir a nivel de base de datos la regla "nunca se edita una fila
 * vigente, se cierra y se crea otra" — solo puede haber una fila ABIERTA
 * por clave en cualquier momento.
 *
 * El seed de abajo entra TODO en estado PENDIENTE_VALIDACION. Ninguna
 * calculadora puede usar un parámetro en ese estado — ParametrosFiscales
 * Service.resolver() lo rechaza explícitamente. Jean (abogado tributario)
 * los valida uno por uno desde el panel de Super Admin.
 *
 * down() real: tabla nueva sin dependientes, sin riesgo de pérdida de
 * datos de otras tablas.
 */
export class CrearParametrosFiscales1765500000000 implements MigrationInterface {
  name = 'CrearParametrosFiscales1765500000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS parametros_fiscales (
        id SERIAL PRIMARY KEY,
        "clave" varchar(80) NOT NULL,
        "valor" jsonb NULL,
        "vigenciaDesde" date NOT NULL,
        "vigenciaHasta" date NULL,
        "baseLegal" text NOT NULL,
        "fuente" text NOT NULL,
        "estado" varchar(30) NOT NULL DEFAULT 'PENDIENTE_VALIDACION'
          CONSTRAINT "CHK_parametro_fiscal_estado" CHECK ("estado" IN ('VALIDADO', 'PENDIENTE_VALIDACION')),
        "validadoPor" integer NULL,
        "validadoEn" timestamp NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_parametro_fiscal_clave" ON parametros_fiscales ("clave")`);
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_parametro_fiscal_vigente"
        ON parametros_fiscales ("clave") WHERE "vigenciaHasta" IS NULL
    `);

    // ── Seed — todo PENDIENTE_VALIDACION, fuente anotada para cada fila ──────
    await qr.query(`
      INSERT INTO parametros_fiscales ("clave", "valor", "vigenciaDesde", "vigenciaHasta", "baseLegal", "fuente") VALUES

      -- Recargo por mora: tramo vigente hasta el 30-jun-2026 (regla anterior)
      ('recargo_mora', '{"primerMes":10,"mesesSiguientes":4,"tope":null}'::jsonb,
       '2000-01-01', '2026-06-30',
       'Art. 252 Código Tributario, modificado por Ley 147-00',
       'Transcripción manual del enunciado del usuario (Jean). vigenciaDesde es una fecha de referencia a la Ley 147-00 (año 2000) — confirmar la fecha exacta.'),

      -- Recargo por mora: tramo vigente desde el 1-jul-2026 (Ley 30-26)
      ('recargo_mora', '{"porMes":3,"topePct":100}'::jsonb,
       '2026-07-01', NULL,
       'Art. 252 Código Tributario, modificado por Ley 30-26',
       'Transcripción manual del enunciado del usuario (Jean). El criterio de transición entre los dos tramos (cómo se reparte una mora que cruza el 1-jul-2026) queda pendiente de que Jean confirme cómo lo aplica la DGII — ver el desglose por mes de la calculadora de recargos e intereses.'),

      -- Interés indemnizatorio mensual, año calendario 2026
      ('interes_indemnizatorio_mensual', '1.10'::jsonb,
       '2026-01-01', '2026-12-31',
       'Art. 27 Código Tributario',
       'Transcripción manual del enunciado del usuario. Desde la Ley 30-26 la base es la tasa activa promedio ponderada del BCRD + 30 puntos básicos, fijada por la DGII cada año — este es el valor de 2026; crear una fila nueva cada año.'),

      -- Descuento de pronto pago sobre recargos (Ley 30-26)
      ('descuento_pronto_pago_recargos',
       '{"rectificacionVoluntaria":90,"aceptaEnAuditoria":70,"pagoTras30diasResolucion":50,"desisteRecurso":30}'::jsonb,
       '2026-06-18', NULL,
       'Ley 30-26 — descuento porcentual solo sobre RECARGOS (nunca sobre el interés indemnizatorio); no aplica si hay defraudación tributaria',
       'Transcripción manual del enunciado del usuario (Jean).'),

      -- Amnistía Ley 30-26, Art. 8
      ('amnistia_ley_30_26', '{"topeMesesRecargoInteres":12,"vigenteHasta":"2026-12-31"}'::jsonb,
       '2026-06-18', '2026-12-31',
       'Ley 30-26, Art. 8',
       'Transcripción manual del enunciado del usuario. vigenciaDesde asumida igual a descuento_pronto_pago_recargos (misma ley) — confirmar con Jean si el Art. 8 entra en vigor en una fecha distinta.'),

      -- Tasas ITBIS
      ('itbis_tasas', '{"general":18,"reducida":16}'::jsonb,
       '2013-01-01', NULL,
       'Ley 253-12 (tasa general 18%); tasa reducida 16% para los bienes del Art. 343 del Código Tributario',
       'Transcripción manual del enunciado del usuario. vigenciaDesde aproximada (Ley 253-12) — confirmar fecha exacta con Jean.'),

      -- ISR Personas Jurídicas
      ('isr_pj', '{"general":27,"transitorio":{"tasa":30,"umbralIngresos":1000000000,"desde":2026,"hasta":2028}}'::jsonb,
       '2015-01-01', NULL,
       'Ley 11-92 Art. 297, tasa general reducida gradualmente por Ley 253-12 hasta 27%; régimen transitorio 30% para grandes contribuyentes por Ley 30-26',
       'Transcripción manual del enunciado del usuario. vigenciaDesde aproximada — confirmar fecha exacta con Jean.'),

      -- Escala ISR Personas Físicas / asalariados, 2026
      ('escala_isr_pf',
       '{"exento":416220.00,"tramos":[' ||
         '{"limiteSuperior":624329.00,"tasa":15,"excesoSobre":416220.00,"acumuladoFijo":0},' ||
         '{"limiteSuperior":867123.00,"tasa":20,"excesoSobre":624329.00,"acumuladoFijo":31216.20},' ||
         '{"limiteSuperior":null,"tasa":25,"excesoSobre":867123.00,"acumuladoFijo":79776.60}' ||
       ']}'::jsonb,
       '2026-01-01', '2026-12-31',
       'Ley 11-92 Art. 296, tabla ISR asalariados/personas físicas 2026',
       'Transcripción manual del enunciado del usuario, que redondeó los acumulados fijos a 31,216 y 79,776 (pesos enteros). Se preservan aquí 31,216.20 y 79,776.60 — los decimales que ya estaban hardcodeados y en uso en isr.service.ts y nomina-calculos.service.ts (ver diagnóstico del Paso 0) — confirmar con Jean cuál es el valor oficial exacto antes de validar.'),

      -- Escala ISR Personas Físicas / asalariados, 2027 — límites de tramo NO confirmados
      ('escala_isr_pf', NULL,
       '2027-01-01', NULL,
       'Ley 11-92 Art. 296 según reforma de la Ley 30-26 — monto exento anual RD$480,000, tasas 15/20/25/27%',
       'Transcripción manual del enunciado del usuario. Los límites exactos de cada tramo (a partir de qué monto empieza cada tasa) NO fueron dados — el usuario los marcó explícitamente como pendientes. valor queda en NULL: la calculadora de ISR asalariados no podrá resolver el ejercicio 2027 hasta que Jean los complete.'),

      -- Impuesto a cheques y transferencias — fecha de cambio de tasa pendiente
      ('impuesto_cheques_transferencias', NULL,
       '2026-01-01', NULL,
       'Ley 288-04, impuesto a cheques y transferencias electrónicas — tasa histórica 1.5 por mil, con indicación de cambio a 2 por mil',
       'Transcripción manual del enunciado del usuario: "1.5 por mil → 2 por mil (fecha de vigencia PENDIENTE)". Sin saber desde cuándo aplica cada tasa no se puede resolver con seguridad para ninguna fecha — valor queda en NULL. Jean debe crear DOS versiones (1.5‰ con su vigenciaDesde real, y 2‰ con la fecha del cambio) en vez de validar esta fila.'),

      -- Todo lo demás — placeholders sin dato aún, a completar por Jean
      ('retenciones_ir17', NULL, '2026-01-01', NULL,
       'Retenciones de ISR por concepto (Formulario IR-17) — a completar', 'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.'),
      ('isr_dividendos', NULL, '2026-01-01', NULL,
       'ISR sobre dividendos distribuidos — a completar', 'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.'),
      ('ipi', NULL, '2026-01-01', NULL,
       'Impuesto al Patrimonio Inmobiliario (IPI) — a completar', 'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.'),
      ('impuesto_transferencia_inmobiliaria', NULL, '2026-01-01', NULL,
       'Impuesto de Transferencia Inmobiliaria — a completar', 'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.'),
      ('anticipos_isr_tet', NULL, '2020-01-01', '2026-12-31',
       'Régimen de anticipos ISR vigente hasta el ejercicio 2026 (TET) — a completar', 'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.'),
      ('anticipos_isr_ley30_26', NULL, '2027-01-01', NULL,
       'Régimen de anticipos ISR por tamaño de empresa desde el ejercicio 2027 (Ley 30-26): micro exenta, pequeña, persona física, mediana/grande — a completar',
       'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.'),
      ('indice_inflacion_dgii', NULL, '2026-01-01', NULL,
       'Índices de inflación DGII para ajuste por inflación de activos, por año — a completar', 'Placeholder creado en el Commit 1 de Herramientas Fiscales, sin datos aún.')
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DROP TABLE IF EXISTS parametros_fiscales`);
  }
}
