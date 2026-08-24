/**
 * Comprueba que una petición con FormData SALE COMO MULTIPART y con el archivo
 * dentro.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
 *
 * El módulo de activación no podía subir nada y el backend respondía "falta el
 * archivo" con el archivo seleccionado en pantalla. La causa estaba en la capa
 * que ningún test tocaba: el cliente axios se crea con
 * 'Content-Type: application/json', y axios NO manda el multipart cuando ese
 * header está puesto — CONVIERTE el FormData a JSON:
 *
 *     {"certificado":{},"clavePfx":"secreta"}
 *
 * El File se pierde (no tiene serialización JSON) y el resto de campos sí
 * viajan. De ahí el mensaje desconcertante.
 *
 * Los tests del backend llamaban al servicio directamente y los del frontend no
 * existen, así que nadie miraba el punto exacto donde estaba el fallo. Este
 * script levanta un servidor real, manda una petición real por el interceptor
 * real, y comprueba qué llega al otro lado.
 *
 * Se ejecuta con `npm run verificar:subidas`.
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

let fallos = 0, total = 0;
const ok = (nombre, cond) => {
  total++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}`); }
};

// ── Servidor que recuerda lo que recibe ─────────────────────────────────────
let ultima = null;
const servidor = createServer((req, res) => {
  const trozos = [];
  req.on('data', c => trozos.push(c));
  req.on('end', () => {
    ultima = {
      contentType: req.headers['content-type'] ?? '',
      cuerpo:      Buffer.concat(trozos).toString('utf8'),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
});
await new Promise(r => servidor.listen(8793, r));

// ── Transpilar el cliente real ──────────────────────────────────────────────
// Se sustituye el import de Sentry y del store por stubs: lo que se prueba es
// el interceptor, no el resto del módulo.
// Se escribe DENTRO de node_modules para que los imports bare (axios) se
// resuelvan al ejecutarlo. En un temp fuera del proyecto no resolverian.
const dest = join(process.cwd(), 'node_modules', '.verificar-subidas.mjs');

const { outputFiles } = await build({
  entryPoints: ['src/api/client.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
  // Solo axios queda externo: su adaptador de Node usa CommonJS y no se puede
  // empaquetar a ESM. El resto se bundlea para no depender de resolucion bare.
  external: ['axios'],
  define: { 'import.meta.env.VITE_API_URL': '"http://127.0.0.1:8793"' },
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /sentryScope|sessionEvents|@sentry/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: `
          export const moduloActual = () => 'test';
          export const emitSessionEnd = () => {};
          export const markNavigatingAway = () => {};
          export const isNavigatingAway = false;
          export const captureException = () => {};
          export default {};
        `,
        loader: 'js',
      }));
    },
  }],
});
writeFileSync(dest, outputFiles[0].text);

// localStorage mínimo — el interceptor lo lee para X-Empresa-ID.
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.get(k) ?? null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); },
};

const { apiClient } = await import(pathToFileURL(dest).href);

console.log('\nEL BUG: FormData por el cliente real\n');

// ── 1. El caso que fallaba ──────────────────────────────────────────────────
{
  const fd = new FormData();
  fd.append('certificado', new Blob(['CONTENIDO-DEL-PFX-DE-PRUEBA']), 'cert.p12');
  fd.append('clavePfx', 'secreta123');

  await apiClient.post('/activacion-ecf/validar-certificado', fd);

  ok('la petición sale como multipart/form-data',
     ultima.contentType.startsWith('multipart/form-data'));
  ok('...y con boundary, que lo pone el navegador',
     /boundary=/.test(ultima.contentType));
  ok('NO sale como application/json (era el bug)',
     !ultima.contentType.includes('application/json'));
  ok('el ARCHIVO llega en el cuerpo',
     ultima.cuerpo.includes('CONTENIDO-DEL-PFX-DE-PRUEBA'));
  ok('llega con su nombre de campo',
     ultima.cuerpo.includes('name="certificado"'));
  ok('y con el nombre del archivo, que usa el fileFilter',
     ultima.cuerpo.includes('cert.p12'));
  ok('los campos de texto también llegan',
     ultima.cuerpo.includes('secreta123'));

  // La firma exacta del bug: el archivo serializado como objeto vacío.
  ok('el archivo NO llega como {} serializado',
     !ultima.cuerpo.includes('"certificado":{}'));
}

// ── 2. Una petición normal sigue siendo JSON ────────────────────────────────
{
  await apiClient.post('/algo', { hola: 'mundo' });
  ok('una petición sin FormData sigue yendo como JSON',
     ultima.contentType.includes('application/json'));
  ok('y con su cuerpo intacto', ultima.cuerpo.includes('mundo'));
}

// ── 3. Aunque alguien fije el header a mano ─────────────────────────────────
{
  // Las subidas antiguas del repo lo ponen explícito. Al borrarlo, el navegador
  // pone el suyo CON boundary — que es mejor que el que escribieron a mano.
  const fd = new FormData();
  fd.append('file', new Blob(['LOGO']), 'logo.png');
  await apiClient.post('/configuracion/empresa/upload-logo', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  ok('un header multipart escrito a mano se reemplaza por uno con boundary',
     /boundary=/.test(ultima.contentType));
  ok('y el archivo llega igual', ultima.cuerpo.includes('LOGO'));
}

servidor.close();
try { unlinkSync(dest); } catch { /* da igual */ }

console.log(`\n${total - fallos}/${total} comprobaciones OK`);
process.exit(fallos ? 1 : 0);
