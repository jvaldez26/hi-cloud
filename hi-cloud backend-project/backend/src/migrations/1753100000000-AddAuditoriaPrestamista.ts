import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C5/A2 (Prestamista): rastro de autoría confiable (userId del CLS).
 * Añade "creadoPor" (INTEGER, userId) a las tablas de operaciones sensibles.
 * Nullable + IF NOT EXISTS: filas viejas quedan con NULL (autor desconocido) y
 * los listados siguen funcionando. Es la base del control de segregación en
 * la aprobación de solicitudes (creador != aprobador).
 *
 * decididoPor/autorizadoPor se mantienen VARCHAR(200): a partir de ahora guardan
 * el userId del CLS (numérico como texto), no un nombre del body. No requieren
 * cambio de tipo — un userId numérico cabe en el VARCHAR existente.
 */
export class AddAuditoriaPrestamista1753100000000 implements MigrationInterface {
  name = 'AddAuditoriaPrestamista1753100000000';

  private readonly tablas = ['pr_solicitudes', 'pr_prestamos', 'pr_pagos'];

  async up(qr: QueryRunner): Promise<void> {
    for (const t of this.tablas) {
      await qr.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "creadoPor" INTEGER NULL DEFAULT NULL`);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    for (const t of this.tablas) {
      await qr.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "creadoPor"`);
    }
  }
}
