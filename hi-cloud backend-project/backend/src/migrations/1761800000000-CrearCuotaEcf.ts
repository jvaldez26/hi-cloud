import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuota de e-CF por plan: contar el consumo, avisar, y dejar el cargo del
 * excedente preparado para que el super admin lo pulse.
 *
 * Sale de que el límite de ingresos no mide al cliente que más factura. La
 * empresa 44 gasta el 47% de su cupo de ingresos y el 94% del de e-CF, y ya
 * está en el plan más alto: sin excedente no hay nada que cobrarle ni ningún
 * plan al que subirla. Hoy nadie se ha pasado — esto es preventivo, y llega con
 * un ciclo de margen.
 *
 * Decisiones:
 *
 * - **Esta tabla NO es el contador.** El consumo se cuenta con `COUNT(*)` sobre
 *   `ecf` acotado al ciclo: la fila de `ecf` se inserta dentro de la misma
 *   transacción que incrementa la secuencia, así que una fila es exactamente
 *   una secuencia consumida, y `createdAt` no se mueve nunca. Un ciclo cerrado
 *   siempre devuelve el mismo número, cosa que un caché no garantiza — el de
 *   ingresos (`suscripciones."ingresosMesActualDop"`) está desviado 420 pesos
 *   ahora mismo. Con el índice `idx_ecf_empresa_fecha` que ya existe, contar el
 *   peor ciclo del sistema (5.112 filas) cuesta 2,1 ms por Index Only Scan. Aquí
 *   solo se guarda lo que NO se puede recomputar: qué avisos se enviaron y, si
 *   se cobró, el recibo congelado.
 *
 * - **`UNIQUE ("empresaId","cicloInicio")` es la pieza central.** Es lo que hace
 *   imposible cobrar dos veces el mismo ciclo. Un cargo duplicado en la cuenta
 *   de un cliente es el error caro de este módulo, y es el que se comete solo.
 *
 * - **`cicloFin` es EXCLUSIVO.** El día del corte abre período, no lo cierra
 *   (misma convención que `preview-pago.util.ts`). Así el borde entre dos ciclos
 *   no cuenta dos veces el mismo comprobante. Ver `ciclo-facturacion.util.ts`.
 *
 * - **El precio se congela en la fila, no se deduce por la fecha.** Cambiar el
 *   precio del excedente NO reprecia ciclos ya cobrados. Mismo criterio que
 *   `TARIFA_ACTIVACION_VERSION` en las solicitudes de activación: el registro
 *   tiene que ser auto-descriptivo.
 *
 * - **`configuracion_cobros` es una tabla propia y no una clave en
 *   `configuraciones_sistema`.** Aquella parecía el sitio obvio, pero su
 *   `PATCH /configuracion/sistema/:clave` está abierto a `UserRole.ADMIN` —el
 *   admin de cualquier empresa cliente— sobre una tabla sin `empresaId`. Un
 *   cliente podría bajarse el precio de su propio excedente. Esta va con
 *   endpoint solo Super Admin y auditada, como el precio de los planes.
 *
 * - **Se siembra con precio 0, que significa SIN CONFIGURAR.** No inventamos un
 *   precio comercial. Mientras valga 0, el panel no deja generar cargos y lo
 *   dice: mismo criterio que `sinPrecio` en el preview de pago, donde sin precio
 *   no se afirma nada en vez de prometer un número falso.
 *
 * Reglas que decide el negocio y que quedan escritas donde se aplican
 * (`CuotaEcfService`, paso siguiente), repetidas aquí porque explican columnas:
 *
 *   1. Los e-CF emitidos en modo TEST (`empresa_ecf_config.modo`) NO cuentan.
 *      No llegan a la DGII. Cobrar por ellos hace discutible todo el cargo,
 *      aunque hoy sean 35 comprobantes entre dos empresas.
 *   2. Si el cliente sube de plan a mitad de ciclo, vale el cupo NUEVO para el
 *      ciclo entero — por eso `cupoCobrado` se sella al cobrar y no al abrir el
 *      ciclo. Cobrarle excedente a quien acaba de pagar más justo para no
 *      tenerlo es la peor conversación posible.
 *   3. Solo se cobran ciclos CERRADOS, y solo de suscripciones activas: una
 *      empresa en prueba que revienta su cupo es una conversación de ventas.
 *
 * Nombres de columna en camelCase y entre comillas: el proyecto no usa
 * NamingStrategy.
 */
export class CrearCuotaEcf1761800000000 implements MigrationInterface {
  name = 'CrearCuotaEcf1761800000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── El ciclo: avisos enviados y, si se cobró, el recibo congelado ─────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "ecf_consumo_ciclo" (
        "id"                SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        "cicloInicio"       DATE    NOT NULL,
        "cicloFin"          DATE    NOT NULL,

        "aviso80EnviadoEn"  TIMESTAMP WITH TIME ZONE,
        "aviso100EnviadoEn" TIMESTAMP WITH TIME ZONE,

        "planCobrado"       VARCHAR(20),
        "cupoCobrado"       INTEGER,
        "emitidosCobrados"  INTEGER,
        "precioUnitario"    NUMERIC(10,2),
        "monto"             NUMERIC(12,2),
        "cargoId"           INTEGER,
        "cobradoEn"         TIMESTAMP WITH TIME ZONE,
        "cobradoPor"        INTEGER,

        "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT "uq_ecf_consumo_empresa_ciclo"
          UNIQUE ("empresaId", "cicloInicio"),

        CONSTRAINT "ck_ecf_consumo_ciclo_orden"
          CHECK ("cicloFin" > "cicloInicio"),

        -- Un cargo sin sus cifras no es un recibo, es un misterio. O están
        -- todas o no hay cargo: sin esto, un fallo a media escritura deja una
        -- fila que dice "cobrado" sin decir cuánto ni a qué precio.
        CONSTRAINT "ck_ecf_consumo_recibo_completo"
          CHECK (
            "cargoId" IS NULL OR (
              "planCobrado"      IS NOT NULL AND
              "cupoCobrado"      IS NOT NULL AND
              "emitidosCobrados" IS NOT NULL AND
              "precioUnitario"   IS NOT NULL AND
              "monto"            IS NOT NULL AND
              "cobradoEn"        IS NOT NULL
            )
          ),

        -- Cobrar 0 excedentes no es cobrar: es un cargo de RD$0 en la cuenta de
        -- un cliente que no se pasó.
        CONSTRAINT "ck_ecf_consumo_excedente_positivo"
          CHECK ("cargoId" IS NULL OR "emitidosCobrados" > "cupoCobrado"),

        CONSTRAINT "fk_ecf_consumo_cargo"
          FOREIGN KEY ("cargoId") REFERENCES "pagos_suscripcion"("id") ON DELETE SET NULL
      )
    `);

    // La consulta del panel: ciclos cerrados sin cobrar. `cargoId IS NULL` es
    // el filtro que manda, y son pocas filas, así que el índice parcial es el
    // que se usa de verdad.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "idx_ecf_consumo_pendiente_cobro"
        ON "ecf_consumo_ciclo" ("cicloFin" DESC)
        WHERE "cargoId" IS NULL
    `);

    // La consulta de la emisión: ¿ya avisé en este ciclo? Va por la unique de
    // arriba, pero el histórico por empresa lo pide el panel de la ficha.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "idx_ecf_consumo_empresa"
        ON "ecf_consumo_ciclo" ("empresaId", "cicloInicio" DESC)
    `);

    // ── El precio del excedente: fila única, editable sin desplegar ───────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "configuracion_cobros" (
        "id"                  INTEGER PRIMARY KEY DEFAULT 1,
        "precioEcfExcedente"  NUMERIC(10,2) NOT NULL DEFAULT 0,
        "actualizadoPor"      INTEGER,
        "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        -- Fila única garantizada por la base de datos, no por convenio. Un
        -- segundo registro de precios sería otro precio vigente al mismo tiempo.
        CONSTRAINT "ck_configuracion_cobros_singleton" CHECK ("id" = 1),

        -- Un precio negativo convertiría el cargo en un crédito.
        CONSTRAINT "ck_configuracion_cobros_precio" CHECK ("precioEcfExcedente" >= 0)
      )
    `);

    // 0 = sin configurar. El panel no deja cobrar hasta que Jean ponga el precio.
    await qr.query(`
      INSERT INTO "configuracion_cobros" ("id", "precioEcfExcedente")
      VALUES (1, 0)
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // `configuracion_cobros` guarda un precio que alguien tecleó, y
    // `ecf_consumo_ciclo` guarda recibos de cargos ya emitidos: ambos se
    // vuelven a crear vacíos si se reaplica la migración, así que el down
    // borra dinero declarado. Se deja explícito para que quien lo ejecute lo
    // sepa; revertir esto en producción exige respaldo previo.
    await qr.query(`DROP TABLE IF EXISTS "configuracion_cobros"`);
    await qr.query(`DROP TABLE IF EXISTS "ecf_consumo_ciclo"`);
  }
}
