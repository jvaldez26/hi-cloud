import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciliación del modelo de dinero de ed_cargos.
 *
 * FixColegiaturaSchema (1753700000000) agregó "monto" al lado de
 * "montoOriginal" sin reconciliar el diseño — deuda que viene de la crisis
 * de julio 2026. El código nunca llegó a usar ambas de forma consistente
 * (ver colegiatura.service.ts antes de este commit): "monto" cargaba el
 * valor ya descontado, "montoOriginal" quedaba NOT NULL sin llenar (eso
 * bloqueaba CUALQUIER creación de cargo — ver el fix de "montoOriginal" en
 * el commit anterior).
 *
 * El modelo reconciliado usa montoOriginal/descuento/montoMora/montoTotal/
 * montoPagado/saldoPendiente (ver colegiatura.service.ts) — "monto" queda
 * sin ningún consumidor en el código. Se elimina en vez de dejarla como
 * columna zombi: 0 filas en producción (0 empresas con el módulo
 * contratado), migración limpia, sin datos que perder ni migrar.
 */
export class DropMontoDuplicadoEdCargos1763300000000 implements MigrationInterface {
  name = 'DropMontoDuplicadoEdCargos1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS monto`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS monto DECIMAL(12,2)`);
  }
}
