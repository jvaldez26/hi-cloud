import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el valor 'empleado' a los enums de rol:
 *  - users_role_enum           (tabla users)
 *  - usuario_empresa_rol_enum  (tabla usuario_empresa)
 *
 * Usa ADD VALUE IF NOT EXISTS para que sea idempotente.
 * NOTA: ALTER TYPE ADD VALUE no puede ejecutarse dentro de una transacción
 * en PostgreSQL < 12; en v12+ sí está permitido, pero usamos queries separadas
 * por seguridad.
 */
export class AddEmpleadoToRoleEnums1749800100000 implements MigrationInterface {
  name = 'AddEmpleadoToRoleEnums1749800100000';

  public async up(qr: QueryRunner): Promise<void> {
    // users.role enum
    await qr.query(`ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'empleado'`);

    // usuario_empresa.rol enum
    await qr.query(`ALTER TYPE usuario_empresa_rol_enum ADD VALUE IF NOT EXISTS 'empleado'`);
  }

  public async down(_qr: QueryRunner): Promise<void> {
    // PostgreSQL no permite eliminar valores de un enum fácilmente.
    // Requeriría recrear el tipo completo — se omite en down().
  }
}
