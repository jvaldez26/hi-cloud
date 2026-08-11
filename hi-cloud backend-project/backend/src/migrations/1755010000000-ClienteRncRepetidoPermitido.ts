import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite varios clientes con el MISMO RNC dentro de una empresa.
 *
 * CASO REAL: escuelas de un mismo distrito educativo. Todas facturan bajo el
 * RNC del distrito, pero son clientes distintos — dirección, contacto y cuenta
 * por cobrar propias. La restricción anterior (empresaId, rfc) lo hacía
 * imposible y obligaba a inventar RNC falsos o a mezclar las cuentas.
 *
 * ANTES:  UNIQUE (empresaId, rfc)                    → bloqueaba el caso legítimo
 * AHORA:  UNIQUE (empresaId, rfc, nombre-normalizado) sobre clientes ACTIVOS
 *
 * La nueva restricción sigue atrapando el duplicado real (alguien registra dos
 * veces al mismo cliente), que es para lo que servía la anterior, pero ya no
 * confunde "mismo contribuyente" con "mismo cliente".
 *
 * DETALLES:
 * - El nombre se normaliza con lower(btrim(...)) para que "Escuela Los Pinos"
 *   y "escuela los pinos " cuenten como el mismo duplicado.
 * - Solo aplica a filas activas: un cliente borrado (soft delete) ya no impide
 *   volver a registrar ese nombre.
 * - No afecta al 606/607: ambos formatos son un detalle por comprobante, una
 *   línea por NCF con el RNC del comprador repetido. No agregan por cliente.
 */
export class ClienteRncRepetidoPermitido1755010000000 implements MigrationInterface {
  name = 'ClienteRncRepetidoPermitido1755010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Guarda: si ya existieran duplicados exactos, el CREATE INDEX fallaría con
    // un error opaco. Preferimos abortar con el detalle de qué filas los causan.
    await queryRunner.query(`
      DO $$
      DECLARE
        dup TEXT;
      BEGIN
        SELECT string_agg(
                 format('empresaId=%s rfc=%s nombre=%L (%s veces)',
                        "empresaId", rfc, lower(btrim(nombre)), veces),
                 '; ')
          INTO dup
        FROM (
          SELECT "empresaId", rfc, lower(btrim(nombre)) AS nombre, COUNT(*) AS veces
          FROM clientes
          WHERE "isActive" = true AND rfc IS NOT NULL AND rfc <> ''
          GROUP BY "empresaId", rfc, lower(btrim(nombre))
          HAVING COUNT(*) > 1
        ) d;

        IF dup IS NOT NULL THEN
          RAISE EXCEPTION
            'No se puede crear UQ_clientes_empresa_rfc_nombre: ya existen duplicados exactos. Resolverlos primero: %', dup;
        END IF;
      END $$;
    `);

    // Fuera la restricción que bloqueaba el RNC repetido
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_clientes_empresa_rfc"`);

    // Restricción nueva y más precisa: mismo RNC + mismo nombre + activo
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_clientes_empresa_rfc_nombre"
      ON clientes("empresaId", rfc, (lower(btrim(nombre))))
      WHERE "isActive" = true AND rfc IS NOT NULL AND rfc <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_clientes_empresa_rfc_nombre"`);

    // Restaurar la restricción anterior. Falla a propósito y con mensaje claro
    // si entretanto se registraron los clientes que esta migración habilitó:
    // recrear el índice a la fuerza no es posible y silenciar el rollback sería
    // peor (dejaría la tabla sin ninguna restricción de duplicados).
    await queryRunner.query(`
      DO $$
      DECLARE
        dup TEXT;
      BEGIN
        SELECT string_agg(format('empresaId=%s rfc=%s (%s clientes)', "empresaId", rfc, veces), '; ')
          INTO dup
        FROM (
          SELECT "empresaId", rfc, COUNT(*) AS veces
          FROM clientes
          WHERE rfc IS NOT NULL AND rfc <> ''
          GROUP BY "empresaId", rfc
          HAVING COUNT(*) > 1
        ) d;

        IF dup IS NOT NULL THEN
          RAISE EXCEPTION
            'No se puede restaurar UQ_clientes_empresa_rfc: hay clientes que comparten RNC (creados tras levantar la restricción). Unificarlos o desactivarlos primero: %', dup;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_clientes_empresa_rfc"
      ON clientes("empresaId", rfc)
      WHERE rfc IS NOT NULL AND rfc <> ''
    `);
  }
}
