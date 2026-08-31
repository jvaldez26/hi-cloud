import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rehace facturas_recurrentes para que la plantilla pueda emitir e-CF.
 *
 * Se REHACE en vez de parchear porque la tabla está VACÍA en producción: cero
 * plantillas y cero facturas con "facturaRecurrenteId" en las 28 empresas, al
 * 2026-08-30. Nadie ha usado nunca el módulo, así que no hay compatibilidad que
 * mantener ni fila que migrar. Tampoco hay claves ajenas entrantes — sólo las
 * dos salientes a clientes y users, que se recrean igual.
 *
 * Qué cambia y por qué:
 *
 *  · "diaEjecucion" → "diaMes" (1-31) y "diaSemana" (1-7). El campo viejo sólo
 *    se miraba en la rama mensual, se ignoraba en las otras tres y aun así el
 *    formulario lo pedía siempre etiquetado "Día del mes (1-28)". 31 pasa a
 *    significar "último día del mes", no "sáltate febrero".
 *
 *  · "fechaInicio" pasa a persistirse. El DTO la pedía, se usaba para sembrar
 *    proximaEjecucion y se tiraba — y el detalle de la plantilla la mostraba
 *    leyendo un campo que nunca existió, así que enseñaba "—" desde el día uno.
 *
 *  · "modoEmision" + "tipoEcf": generar borrador (lo de siempre) o emitir con
 *    comprobante fiscal.
 *
 *  · "formaPago" + "diasCredito": la plantilla define cómo se paga y la factura
 *    lo hereda. Antes no se guardaba nada, la factura salía con el CONTADO por
 *    defecto de la columna y una recurrente a crédito NUNCA generaba cuenta por
 *    cobrar, porque facturas.cambiarEstado() sólo la crea si tipoPago=CREDITO.
 *
 *  · "ciclosSaltados": una caída del servidor genera UNA factura al volver, no
 *    las N atrasadas. Pero el salto se cuenta y se avisa, nunca en silencio.
 *
 *  · "ultimoError"/"ultimoErrorAt": cuando la emisión no pasa las comprobaciones
 *    previas, la factura queda en borrador con el motivo escrito.
 *
 *  · "avisoPrevioDias"/"avisoPrevioEnviadoPara": aviso de lo que va a salir.
 *
 * Y en `facturas`, las cinco columnas de correo: el envío al cliente ya existía
 * pero era fire-and-forget con un logger.warn — un fallo no se guardaba en
 * ninguna parte y no había forma de reenviarlo. Ahora deja rastro y se reenvía.
 *
 * Columnas en camelCase y entrecomilladas: esta base no usa NamingStrategy, las
 * entidades mapean a camelCase tal cual. Con snake_case el backend arranca y
 * revienta al primer SELECT con "la columna no existe".
 */
export class RehacerFacturasRecurrentes1761500000000 implements MigrationInterface {
  name = 'RehacerFacturasRecurrentes1761500000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Guarda: si alguien creó plantillas entre el reconocimiento y el deploy,
    //    esta migración pararía en vez de borrarlas.
    const [{ filas }] = await qr.query(
      `SELECT COUNT(*)::int AS filas FROM facturas_recurrentes`,
    ) as { filas: number }[];
    if (filas > 0) {
      throw new Error(
        `RehacerFacturasRecurrentes: la tabla tiene ${filas} fila(s). Esta migración ` +
        `asume la tabla vacía (lo estaba al escribirla). Migra los datos a mano ` +
        `antes de continuar.`,
      );
    }

    await qr.query(`DROP TABLE IF EXISTS facturas_recurrentes`);
    await qr.query(`DROP TYPE IF EXISTS facturas_recurrentes_frecuencia_enum`);

    await qr.query(`
      CREATE TYPE facturas_recurrentes_frecuencia_enum
        AS ENUM ('diaria', 'semanal', 'mensual', 'anual')
    `);

    await qr.query(`
      CREATE TABLE facturas_recurrentes (
        "id"                     SERIAL PRIMARY KEY,
        "isActive"               BOOLEAN   NOT NULL DEFAULT true,
        "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"              INTEGER   NULL,

        "nombre"                 VARCHAR(200) NOT NULL,
        "clienteId"              INTEGER   NOT NULL,
        "detalles"               JSON      NOT NULL,

        "frecuencia"             facturas_recurrentes_frecuencia_enum NOT NULL DEFAULT 'mensual',
        "diaMes"                 INTEGER   NULL,
        "diaSemana"              INTEGER   NULL,
        "fechaInicio"            DATE      NOT NULL,
        "proximaEjecucion"       DATE      NOT NULL,
        "ultimaEjecucion"        DATE      NULL,
        "fechaFin"               DATE      NULL,
        "totalGeneradas"         INTEGER   NOT NULL DEFAULT 0,
        "ciclosSaltados"         INTEGER   NOT NULL DEFAULT 0,
        "activa"                 BOOLEAN   NOT NULL DEFAULT true,

        "modoEmision"            VARCHAR(10) NOT NULL DEFAULT 'borrador',
        "tipoEcf"                VARCHAR(4)  NULL,

        "formaPago"              INTEGER   NOT NULL DEFAULT 1,
        "diasCredito"            INTEGER   NOT NULL DEFAULT 0,

        "emailCliente"           BOOLEAN   NOT NULL DEFAULT true,
        "avisoPrevioDias"        INTEGER   NOT NULL DEFAULT 0,
        "avisoPrevioEnviadoPara" DATE      NULL,

        "ultimoError"            TEXT      NULL,
        "ultimoErrorAt"          TIMESTAMP NULL,
        "notas"                  TEXT      NULL,
        "userId"                 INTEGER   NOT NULL,

        CONSTRAINT "FK_facturas_recurrentes_cliente"
          FOREIGN KEY ("clienteId") REFERENCES clientes(id),
        CONSTRAINT "FK_facturas_recurrentes_user"
          FOREIGN KEY ("userId") REFERENCES users(id),

        -- 31 es legítimo y significa "último día del mes". Ver diaDelMes().
        CONSTRAINT "CHK_facturas_recurrentes_diaMes"
          CHECK ("diaMes" IS NULL OR ("diaMes" BETWEEN 1 AND 31)),
        CONSTRAINT "CHK_facturas_recurrentes_diaSemana"
          CHECK ("diaSemana" IS NULL OR ("diaSemana" BETWEEN 1 AND 7)),
        CONSTRAINT "CHK_facturas_recurrentes_modoEmision"
          CHECK ("modoEmision" IN ('borrador', 'ecf')),
        -- Códigos DGII: 1=Efectivo 2=Cheque/Transferencia 3=Tarjeta 4=Crédito
        CONSTRAINT "CHK_facturas_recurrentes_formaPago"
          CHECK ("formaPago" BETWEEN 1 AND 6),
        -- Crédito sin plazo generaría una CxC sin vencimiento.
        CONSTRAINT "CHK_facturas_recurrentes_plazo"
          CHECK ("formaPago" <> 4 OR "diasCredito" > 0)
      )
    `);

    await qr.query(`
      CREATE INDEX "IDX_facturas_recurrentes_empresa"
        ON facturas_recurrentes ("empresaId", "isActive")
    `);
    // El cron barre por aquí todas las madrugadas.
    await qr.query(`
      CREATE INDEX "IDX_facturas_recurrentes_barrido"
        ON facturas_recurrentes ("activa", "proximaEjecucion")
    `);

    // ── Rastro del correo en la factura ────────────────────────────────────
    await qr.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "emailEstado"    VARCHAR(12)  NULL,
        ADD COLUMN IF NOT EXISTS "emailEnviadoAt" TIMESTAMP    NULL,
        ADD COLUMN IF NOT EXISTS "emailDestino"   VARCHAR(320) NULL,
        ADD COLUMN IF NOT EXISTS "emailError"     TEXT         NULL,
        ADD COLUMN IF NOT EXISTS "emailIntentos"  INTEGER      NOT NULL DEFAULT 0
    `);

    // ── Por qué esta factura se quedó sin comprobante ──────────────────────
    //
    // Una factura EMITIDA sin e-CF era indistinguible en el listado de una
    // pendiente de emitir legítima: las dos enseñan el mismo botón "Emitir".
    // Con emisión automática eso importa, porque no hay nadie mirando en el
    // momento: una factura así, si nadie la ve, se queda así para siempre.
    await qr.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "ecfError"   TEXT      NULL,
        ADD COLUMN IF NOT EXISTS "ecfErrorAt" TIMESTAMP NULL
    `);

    // Índice parcial: son pocas filas y se consultan por "las que fallaron".
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_facturas_ecf_error"
        ON facturas ("empresaId") WHERE "ecfError" IS NOT NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_facturas_ecf_error"`);
    await qr.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "emailEstado",
        DROP COLUMN IF EXISTS "emailEnviadoAt",
        DROP COLUMN IF EXISTS "emailDestino",
        DROP COLUMN IF EXISTS "emailError",
        DROP COLUMN IF EXISTS "emailIntentos",
        DROP COLUMN IF EXISTS "ecfError",
        DROP COLUMN IF EXISTS "ecfErrorAt"
    `);

    await qr.query(`DROP TABLE IF EXISTS facturas_recurrentes`);
    await qr.query(`DROP TYPE IF EXISTS facturas_recurrentes_frecuencia_enum`);

    // Estructura anterior, para que un rollback deje el backend arrancable.
    await qr.query(`
      CREATE TYPE facturas_recurrentes_frecuencia_enum
        AS ENUM ('diaria', 'semanal', 'mensual', 'anual')
    `);
    await qr.query(`
      CREATE TABLE facturas_recurrentes (
        "id"               SERIAL PRIMARY KEY,
        "isActive"         BOOLEAN   NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "nombre"           VARCHAR(200) NOT NULL,
        "clienteId"        INTEGER   NOT NULL REFERENCES clientes(id),
        "detalles"         JSON      NOT NULL,
        "frecuencia"       facturas_recurrentes_frecuencia_enum NOT NULL DEFAULT 'mensual',
        "diaEjecucion"     INTEGER   NOT NULL DEFAULT 1,
        "proximaEjecucion" DATE      NOT NULL,
        "ultimaEjecucion"  DATE      NULL,
        "fechaFin"         DATE      NULL,
        "totalGeneradas"   INTEGER   NOT NULL DEFAULT 0,
        "activa"           BOOLEAN   NOT NULL DEFAULT true,
        "notas"            TEXT      NULL,
        "userId"           INTEGER   NOT NULL REFERENCES users(id),
        "empresaId"        INTEGER   NULL
      )
    `);
  }
}
