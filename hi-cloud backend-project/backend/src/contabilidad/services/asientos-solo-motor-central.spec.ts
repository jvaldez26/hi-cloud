import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Contrato: NINGÚN archivo fuera de este backend debe escribir directamente
 * en asientos_contables/asiento_lineas con SQL crudo — todo asiento pasa por
 * AsientosAutomaticosService (partida doble validada, reporte a Sentry si
 * falta una cuenta, numeración consistente).
 *
 * Encontrado dos veces (2026-09-19): restaurante.service.ts (Caja/Bancos/
 * Ventas/ITBIS hardcodeados, userId fijo en 1) y distribucion-costos.service.ts
 * (mismo bypass, y ADEMÁS el INSERT nunca ponía "numero" — columna NOT NULL
 * — así que cada ejecución de una regla reventaba con una violación de
 * constraint). Los dos migrados al motor compartido. Este test barre
 * TODO `src/**\/*.ts` (recorrido manual, sin dependencia de `glob` — mismo
 * patrón que scripts/check-entity-migrations.js y
 * streamable-file-passthrough.spec.ts) para que el bypass no vuelva a
 * aparecer en un módulo nuevo.
 *
 * Ni siquiera AsientosAutomaticosService usa SQL crudo para esto — persiste
 * con asientoRepository.save()/lineaRepository.save() (TypeORM), así que no
 * hace falta ninguna excepción/allowlist: el patrón no debe aparecer en NINGÚN
 * archivo de código de aplicación.
 */
function listarArchivosTs(dir: string): string[] {
  const resultado: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'migrations') continue;
      resultado.push(...listarArchivosTs(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      resultado.push(full);
    }
  }
  return resultado;
}

describe('Ningún archivo fuera del motor central escribe asientos con SQL crudo', () => {
  const srcRoot = join(__dirname, '..', '..');
  const archivos = listarArchivosTs(srcRoot);

  it('encontró archivos .ts para revisar (el recorrido no está roto)', () => {
    expect(archivos.length).toBeGreaterThan(200);
  });

  it.each(archivos)('%s', (archivo) => {
    // Se quitan comentarios de línea y de bloque antes de revisar — un
    // comentario que EXPLIQUE el patrón prohibido (como el de este mismo
    // archivo) no debe hacer fallar el test que lo vigila.
    const src = readFileSync(archivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const insertaAsiento = /INSERT\s+INTO\s+asientos_contables/i.test(src);
    const insertaLinea   = /INSERT\s+INTO\s+asiento_lineas/i.test(src);
    if (insertaAsiento || insertaLinea) {
      throw new Error(
        `${archivo} inserta directamente en ${insertaAsiento ? 'asientos_contables' : 'asiento_lineas'} ` +
        `con SQL crudo, bypaseando AsientosAutomaticosService — sin validación de partida doble, sin ` +
        `reporte a Sentry si falta una cuenta, y con riesgo real de omitir columnas NOT NULL (ver ` +
        `restaurante.service.ts y distribucion-costos.service.ts, ambos corregidos). Usa ` +
        `asientosService.crearAsientoContabilizado() o el método específico del motor en su lugar.`,
      );
    }
  });
});
