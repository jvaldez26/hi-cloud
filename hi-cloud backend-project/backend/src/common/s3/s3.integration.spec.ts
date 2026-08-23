/**
 * Test de integración: S3Service.getSignedUrl() → HTTP 200
 *
 * Este test SOLO corre en un entorno con credenciales AWS reales
 * (AWS_S3_BUCKET + AWS_S3_PROFILE + AWS_SHARED_CREDENTIALS_FILE).
 * En CI, donde estas variables no están, el test se omite automáticamente.
 *
 * Por qué existe este test (y no uno de unidad):
 *   Un test de unidad puede verificar que se *genera* una URL firmada, pero
 *   no que AWS la acepta. Si el bucket no existe, el perfil no tiene GetObject,
 *   o la key no existe, la URL se genera igual pero devuelve 403/404.
 *   El test de integración cierra ese gap: llama al endpoint real y verifica
 *   que el HTTP response es 200.
 *
 * Objeto de prueba: imagenes/productos/2/12fd0d8ec7973979.jpg
 *   (uno de los 3 productos migrados del bucket de backups al de media en 2026-08-22)
 *
 * Ejecutar localmente:
 *   cd "hi-cloud backend-project/backend"
 *   AWS_S3_BUCKET=hicloud-media-966448715183 \
 *   AWS_S3_PROFILE=hicloud-media \
 *   AWS_SHARED_CREDENTIALS_FILE=~/.aws/credentials \
 *   npx jest s3.integration --testTimeout=15000
 */

const AWS_BUCKET  = process.env.AWS_S3_BUCKET  ?? '';
const AWS_PROFILE = process.env.AWS_S3_PROFILE ?? '';

const hasRealCredentials = !!AWS_BUCKET && !!AWS_PROFILE;
const describeIf = hasRealCredentials ? describe : describe.skip;

// Key de un objeto real subido al bucket de media el 2026-08-22
const REAL_KEY = 'imagenes/productos/2/12fd0d8ec7973979.jpg';

describeIf('S3Service — integración real con AWS', () => {
  it(
    'getSignedUrl() devuelve una URL que responde HTTP 200 (objeto existe y creds son válidas)',
    async () => {
      const { S3Service } = await import('./s3.service');

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

      // Expiración corta (30 s) — solo necesitamos que la respuesta llegue al test
      const url = await svc.getSignedUrl(REAL_KEY, 30);
      expect(url).toBeTruthy();

      // La URL firmada debe resolverse con HTTP 200; si no, algo falló en:
      //   - las credenciales IAM (permisos GetObject)
      //   - el objeto (no existe en el bucket)
      //   - el bucket (acceso público, región, nombre incorrecto)
      const response = await fetch(url!);
      expect(response.status).toBe(200);

      const contentType = response.headers.get('content-type') ?? '';
      expect(contentType).toMatch(/^image\//);
    },
    15_000, // timeout: la llamada fetch puede tardar en redes lentas
  );
});
