import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preferencias por usuario y empresa.
 *
 * Sale de que el dashboard pasa a ser configurable: cada persona elige que
 * graficas ve. La seleccion NO puede ir en localStorage —se pierde al cambiar de
 * equipo, y el dueno entra desde el movil y desde la caja— ni por empresa, porque
 * dos personas de la misma ferreteria miran cosas distintas.
 *
 * Decisiones:
 *
 * - **Tabla propia, no otra columna en `users`.** Ya hay precedente de
 *   preferencias por usuario ahi (`temaSidebar`, `tourCompletado`), pero `users`
 *   se carga en el camino de autenticacion de cada request y cada preferencia
 *   nueva seria otra migracion. Clave/valor generico: la siguiente entra sin SQL.
 *
 * - **La clave lleva `empresaId`.** El requisito era "por usuario", y con
 *   `userId` en la clave ya se cumple. Se anade la empresa porque un contador que
 *   lleva una ferreteria y una farmacia no quiere las mismas graficas en las dos,
 *   y ese perfil existe entre los clientes.
 *
 * - **`empresaId` NOT NULL.** En Postgres los NULL son distintos entre si dentro
 *   de un indice unico, asi que una columna nullable NO impediria filas
 *   duplicadas para el mismo (userId, clave). Si lleva empresa, la lleva siempre.
 *
 * - **Sin indice extra.** El UNIQUE (userId, empresaId, clave) ya crea un indice
 *   cuyas columnas iniciales son justo por las que se busca. Anadir
 *   idx_..._userId_empresaId seria un duplicado que se mantiene en cada escritura
 *   para no servir ninguna consulta — que es exactamente la deuda que arrastra
 *   `factura_detalles`.
 *
 * - **Sin FK sobre `empresaId`.** Es la convencion del proyecto y la valida el
 *   hook de pre-push: el aislamiento por empresa se hace en codigo (TenantService
 *   y TenantSubscriber), no con integridad referencial. La FK sobre `userId` si
 *   se queda: al borrar un usuario, sus preferencias se van con el.
 *
 * Nombres de columna en camelCase y entre comillas: el proyecto no usa
 * NamingStrategy, asi que en snake_case el backend arranca y revienta con
 * "la columna no existe".
 */
export class CrearPreferenciasUsuario1761200000000 implements MigrationInterface {
  name = 'CrearPreferenciasUsuario1761200000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "preferencias_usuario" (
        "id"        SERIAL PRIMARY KEY,
        "userId"    INTEGER      NOT NULL,
        "empresaId" INTEGER      NOT NULL,
        "clave"     VARCHAR(80)  NOT NULL,
        "valor"     JSONB        NOT NULL,
        "isActive"  BOOLEAN      NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_pref_usuario_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_pref_usuario_clave"
          UNIQUE ("userId", "empresaId", "clave")
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "preferencias_usuario"`);
  }
}
