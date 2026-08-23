/**
 * TEST DE INTEGRACIÓN MANUAL — no corre en CI.
 *
 * Este archivo usa extensión .integration.ts (no .spec.ts) a propósito:
 * el jest config usa testRegex: ".*\\.spec\\.ts$", así que este archivo
 * queda excluido de la suite normal. No aparece en el CI. No da verde falso.
 *
 * Qué verifica:
 *   S3Service.getSignedUrl() genera una URL que AWS acepta con HTTP 200.
 *   Un test de unidad puede verificar que se *genera* una URL firmada, pero
 *   no que AWS la acepta. Si las credenciales son incorrectas, el bucket no
 *   existe, el IAM user no tiene GetObject, o la key no existe, la URL se
 *   genera igual pero devuelve 403/404. Este test cierra ese gap.
 *
 * Cómo correr:
 *   cd "hi-cloud backend-project/backend"
 *   AWS_S3_BUCKET=hicloud-media-966448715183 \
 *   AWS_S3_PROFILE=hicloud-media \
 *   AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials \
 *   npx jest --testRegex="test-manual/.*\\.ts$" --testTimeout=15000 --rootDir .
 *
 * Este archivo está en test-manual/ (fuera de src/) — excluido de:
 *   - tsconfig.json: rootDir es ./src
 *   - jest: testRegex ".*\\.spec\\.ts$" no lo captura
 *   No hay riesgo de verde falso en CI.
 *
 * Cuándo correr:
 *   - Al rotar las claves del IAM User hicloud-media
 *   - Al cambiar el bucket o la región
 *   - Al cambiar la política IAM de GetObject
 *   - Antes de un deploy que toque S3Service o las credenciales
 *
 * Objeto de prueba: imagenes/productos/2/12fd0d8ec7973979.jpg
 *   (migrado al bucket de media el 2026-08-22)
 */

const AWS_BUCKET  = process.env.AWS_S3_BUCKET  ?? '';
const AWS_PROFILE = process.env.AWS_S3_PROFILE ?? '';

if (!AWS_BUCKET || !AWS_PROFILE) {
  // Fallo explícito si alguien lo corre sin las variables de entorno requeridas.
  // No usa describe.skip porque un skip silencioso es el problema que queremos evitar.
  throw new Error(
    'Este test de integración requiere credenciales AWS reales.\n' +
    'Corre con:\n' +
    '  AWS_S3_BUCKET=hicloud-media-966448715183 \\\n' +
    '  AWS_S3_PROFILE=hicloud-media \\\n' +
    '  AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials \\\n' +
    '  npx jest --testRegex="test-manual/.*\\.ts$" --testTimeout=15000 --rootDir .',
  );
}

// Key de un objeto real subido al bucket de media el 2026-08-22
const REAL_KEY = 'imagenes/productos/2/12fd0d8ec7973979.jpg';

describe('S3Service — integración real con AWS', () => {
  it(
    'getSignedUrl() devuelve una URL que responde HTTP 200 (objeto existe y creds son válidas)',
    async () => {
      const { S3Service } = await import('../src/common/s3/s3.service');

      const config = {
        get: (k: string, def?: any) => {
          if (k === 'AWS_S3_BUCKET')               return AWS_BUCKET;
          if (k === 'AWS_S3_PROFILE')              return AWS_PROFILE;
          if (k === 'AWS_REGION')                  return process.env.AWS_REGION ?? 'us-east-2';
          if (k === 'AWS_SHARED_CREDENTIALS_FILE') return process.env.AWS_SHARED_CREDENTIALS_FILE ?? '';
          return def ?? '';
        },
      } as any;

      const svc = new S3Service(config);
      expect(svc.isEnabled).toBe(true);

      const url = await svc.getSignedUrl(REAL_KEY, 30); // 30 s — solo necesitamos que llegue
      expect(url).toBeTruthy();

      // HTTP 200 confirma: credenciales válidas + GetObject permitido + objeto existe
      const response = await fetch(url!);
      expect(response.status).toBe(200);

      const contentType = response.headers.get('content-type') ?? '';
      expect(contentType).toMatch(/^image\//);
    },
    15_000,
  );
});
