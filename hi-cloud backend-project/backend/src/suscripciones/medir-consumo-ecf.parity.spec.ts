import { ciclosRecientes, diaAnclado } from './ciclo-facturacion.util';
import { PLANES, PlanTipo } from './entities/suscripcion.entity';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require('../../scripts/medir-consumo-ecf.js');

/**
 * El script de medición replica la regla de ciclo y la tabla de cupos porque no
 * puede importarlas: el util es TypeScript con imports sin extensión —normal en
 * Nest, irresoluble para ESM— y `dist/` puede estar obsoleto.
 *
 * Este test es lo que impide que las dos copias se separen. Y cubre más de lo
 * que cubriría un import: los cupos tampoco se pueden importar desde un script
 * de Node, así que la tabla CUPO solo está atada aquí.
 *
 * Si esto se pone rojo, alguien cambió una de las dos y no la otra. Lo que hay
 * que igualar es lo que dice `src/suscripciones/ciclo-facturacion.util.ts`: esa
 * es la fuente, el script es la réplica.
 */

/** Todos los cortes posibles, incluidos los que ningún mes tiene entero. */
const CORTES = Array.from({ length: 31 }, (_, i) => i + 1);

/** Fechas repartidas por meses cortos, largos, cambio de año y bisiesto. */
const FECHAS: string[] = [];
for (const [anio, mes] of [
  [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 6],
  [2026, 12], [2027, 1], [2028, 2],
] as [number, number][]) {
  for (const dia of [1, 2, 5, 14, 15, 27, 28]) {
    const ultimo = new Date(anio, mes, 0).getDate();
    if (dia <= ultimo) {
      FECHAS.push(`${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
    }
  }
}

describe('el script de medición no se separa del util', () => {
  it('el anclaje del día de corte coincide en todos los meses', () => {
    for (const anio of [2026, 2027, 2028]) {
      for (let mes = 1; mes <= 12; mes++) {
        for (const corte of CORTES) {
          expect(script.diaAnclado(anio, mes, corte)).toBe(diaAnclado(anio, mes, corte));
        }
      }
    }
  });

  it('los ciclos coinciden para cada corte y cada fecha', () => {
    let comparados = 0;
    for (const corte of CORTES) {
      for (const hoy of FECHAS) {
        const delScript = script.ciclosDe(corte, 3, new Date(`${hoy}T12:00:00`));
        const delUtil   = ciclosRecientes(corte, 3, hoy);

        expect(delScript).toHaveLength(delUtil.length);
        delUtil.forEach((c, i) => {
          expect(delScript[i].desde).toBe(c.inicio);
          expect(delScript[i].hasta).toBe(c.fin);
        });
        comparados += delUtil.length;
      }
    }
    // Si esto baja, es que el barrido de combinaciones se quedó corto.
    expect(comparados).toBeGreaterThan(4_000);
  });

  it('la tabla de cupos del script coincide con PLANES', () => {
    for (const [clave, cfg] of Object.entries(PLANES)) {
      expect(script.CUPO[clave]).toBe(cfg.limiteEcfMensual);
    }
  });

  it('el script no se ha dejado ningún plan fuera', () => {
    const delScript = Object.keys(script.CUPO).sort();
    const delCodigo = Object.keys(PLANES).sort();
    expect(delScript).toEqual(delCodigo);
  });

  it('los cuatro planes activos siguen valiendo lo acordado', () => {
    // Los números del encargo. Si cambian, que sea a conciencia.
    expect(PLANES[PlanTipo.EMPRENDEDOR].limiteEcfMensual).toBe(500);
    expect(PLANES[PlanTipo.PYME].limiteEcfMensual).toBe(1_000);
    expect(PLANES[PlanTipo.PRO].limiteEcfMensual).toBe(2_500);
    expect(PLANES[PlanTipo.PLUS].limiteEcfMensual).toBe(6_000);
  });

  it('requerir el script no abre conexiones ni ejecuta el informe', () => {
    // El guard `require.main !== module` es lo que hace este test posible: sin
    // él, importarlo intentaría conectarse a producción.
    expect(typeof script.ciclosDe).toBe('function');
    expect(typeof script.diaAnclado).toBe('function');
    expect(script.CUPO).toBeDefined();
  });
});
