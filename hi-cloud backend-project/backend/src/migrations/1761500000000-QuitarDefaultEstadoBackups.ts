import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quita el DEFAULT 'EN_PROGRESO' de backup_registros.estado.
 *
 * ── QUE TRAMPA CIERRA ───────────────────────────────────────────────────────
 *
 * La columna se declaraba `default: 'EN_PROGRESO'`. Hoy los tres sitios que
 * insertan —registrarExito, registrarFallo y triggerManual— fijan el estado
 * siempre, asi que el default no lo usa nadie. El problema es el INSERT que
 * venga manana: si omite `estado`, la fila nace ABIERTA y en silencio.
 *
 * Y una fila abierta no es un detalle cosmetico. `cerrarColgados()` la marcara
 * como FALLIDO media hora despues con el motivo "reporte no recibido", y eso
 * cuenta en la tasa de exito del panel: un respaldo que nadie hizo aparece como
 * un respaldo que fallo. Ya paso con el boton manual — cada disparo exitoso
 * dejaba una huerfana— y costo una investigacion entera averiguar de donde
 * salia la segunda fila.
 *
 * Sin default, ese INSERT revienta con NOT NULL en vez de colarse. Es
 * exactamente el cambio que se quiere: que falle fuerte y de una vez, en lugar
 * de ensuciar una metrica que alguien mirara meses despues.
 *
 * NO toca ninguna fila existente: DROP DEFAULT solo afecta a INSERTs futuros
 * que omitan la columna. Los estados ya escritos se quedan como estan.
 *
 * La base no usa NamingStrategy — las entidades mapean a camelCase tal cual—,
 * de ahi que "estado" vaya entrecomillado por consistencia con el resto.
 */
export class QuitarDefaultEstadoBackups1761500000000 implements MigrationInterface {
  name = 'QuitarDefaultEstadoBackups1761500000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE backup_registros
        ALTER COLUMN "estado" DROP DEFAULT
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE backup_registros
        ALTER COLUMN "estado" SET DEFAULT 'EN_PROGRESO'
    `);
  }
}
