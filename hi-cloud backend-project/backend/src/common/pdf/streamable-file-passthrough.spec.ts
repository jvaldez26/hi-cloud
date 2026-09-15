import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Contrato: ningún controller debe combinar `@Res({ passthrough: true })`
 * con `StreamableFile` (ni retornar un Buffer crudo bajo passthrough) — el
 * `ResponseInterceptor` global (`main.ts`) envuelve TODO lo que un handler
 * retorna en `{success, data, timestamp}`. Un StreamableFile envuelto deja
 * de ser reconocido como tal y Nest lo serializa como JSON del buffer byte
 * a byte en vez de servirlo como binario — el archivo descargado no abre.
 *
 * Encontrado en clinica.controller.ts (recetas/laboratorio/expediente,
 * corregido) al implementar boletines del módulo educativo — mismo patrón
 * roto, mismo fix: `@Res()` SIN passthrough + `res.send(buffer)` directo
 * (ver agro/pdf/pdf.controller.ts, cotizaciones.controller.ts, y el resto
 * de los ~45 endpoints de archivo del backend, que ya usan el patrón
 * correcto). Este test barre TODO `src/**\/*.controller.ts` (recorrido
 * manual, sin dependencia de `glob` — mismo patrón que
 * scripts/check-entity-migrations.js) para que el error no vuelva a
 * aparecer en un controller nuevo.
 */
function listarControllers(dir: string): string[] {
  const resultado: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      resultado.push(...listarControllers(full));
    } else if (entry.name.endsWith('.controller.ts')) {
      resultado.push(full);
    }
  }
  return resultado;
}

describe('Ningún controller mezcla StreamableFile con @Res({ passthrough: true })', () => {
  const srcRoot = join(__dirname, '..', '..');
  const controllers = listarControllers(srcRoot);

  it('encontró controllers para revisar (el recorrido no está roto)', () => {
    expect(controllers.length).toBeGreaterThan(50);
  });

  it.each(controllers)('%s', (archivo) => {
    // Se quitan comentarios de línea y de bloque antes de revisar — un
    // comentario que EXPLIQUE la trampa (como el de clinica.controller.ts)
    // no debe hacer fallar el propio test que la vigila.
    const src = readFileSync(archivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const usaStreamableFile = /\bStreamableFile\b/.test(src);
    const usaPassthrough = /passthrough:\s*true/.test(src);
    if (usaStreamableFile && usaPassthrough) {
      throw new Error(
        `${archivo} combina StreamableFile con @Res({ passthrough: true }) — ` +
        `el ResponseInterceptor global corrompe el archivo servido (ver clinica.controller.ts, ` +
        `corregido, y feedback_streamablefile_interceptor_trampa en memoria). ` +
        `Usa @Res() SIN passthrough + res.send(buffer) en su lugar.`,
      );
    }
  });
});
