import { clasificarErrorS3, EXPLICACION_S3 } from './s3-error.util';

/**
 * El caso real: los respaldos llevaban desde el 12 de mayo subiendose a S3 sin
 * un solo fallo, el bucket existia, la region era correcta y las credenciales
 * del script tenian ListBucket. Y el panel decia "S3 no responde".
 *
 * La causa era que el BACKEND no tenia credenciales — AWS_ACCESS_KEY_ID
 * comentada en su .env y la instancia sin rol IAM. El `catch {}` de
 * verificarS3() tiraba esa informacion y dejaba un mensaje que apuntaba a tres
 * sitios a la vez, ninguno de ellos el correcto.
 *
 * Estos tests fijan la distincion.
 */

/** Los errores del SDK v3 llevan `name` y `$metadata.httpStatusCode`. */
const errorSdk = (name: string, status?: number, message = '') =>
  ({ name, message, $metadata: status ? { httpStatusCode: status } : {} });

describe('clasificarErrorS3', () => {
  describe('sin credenciales — el caso que nos costo tres rondas', () => {
    it('CredentialsProviderError: la cadena de proveedores se agoto', () => {
      expect(clasificarErrorS3(errorSdk(
        'CredentialsProviderError', undefined,
        'Could not load credentials from any providers',
      ))).toBe('sin-credenciales');
    });

    it('el texto de la CLI tambien se reconoce', () => {
      expect(clasificarErrorS3({ message: 'Unable to locate credentials' }))
        .toBe('sin-credenciales');
    });

    it('credenciales presentes pero invalidas cuentan como sin-credenciales', () => {
      // Para quien lo lee, "la clave no sirve" y "no hay clave" llevan al mismo
      // sitio: revisar como se autentica el backend. No a las politicas IAM.
      expect(clasificarErrorS3(errorSdk('InvalidAccessKeyId', 403))).toBe('sin-credenciales');
      expect(clasificarErrorS3(errorSdk('SignatureDoesNotMatch', 403))).toBe('sin-credenciales');
      expect(clasificarErrorS3(errorSdk('ExpiredToken', 400))).toBe('sin-credenciales');
    });

    it('EL ORDEN IMPORTA: un fallo de credenciales con 403 NO es "sin permisos"', () => {
      // Si esto se clasificara por el status, mandaria a revisar politicas IAM
      // que estan perfectas — que es exactamente el rato que perdimos.
      expect(clasificarErrorS3(errorSdk('InvalidAccessKeyId', 403))).not.toBe('sin-permisos');
    });
  });

  describe('los otros tres casos', () => {
    it('403 limpio es falta de permisos', () => {
      expect(clasificarErrorS3(errorSdk('Forbidden', 403))).toBe('sin-permisos');
      expect(clasificarErrorS3(errorSdk('AccessDenied', 403))).toBe('sin-permisos');
    });

    it('404 es bucket inexistente', () => {
      expect(clasificarErrorS3(errorSdk('NotFound', 404))).toBe('no-existe');
      expect(clasificarErrorS3(errorSdk('NoSuchBucket', 404))).toBe('no-existe');
    });

    it('301 es region equivocada', () => {
      expect(clasificarErrorS3(errorSdk('PermanentRedirect', 301))).toBe('region-incorrecta');
    });

    it('lo que no encaja se admite como desconocido, no se fuerza', () => {
      expect(clasificarErrorS3(errorSdk('TimeoutError'))).toBe('desconocido');
      expect(clasificarErrorS3({})).toBe('desconocido');
      expect(clasificarErrorS3(null)).toBe('desconocido');
    });
  });

  describe('cada motivo dice que hacer', () => {
    it('todos tienen explicacion', () => {
      for (const m of ['sin-credenciales', 'sin-permisos', 'no-existe', 'region-incorrecta', 'desconocido'] as const) {
        expect(EXPLICACION_S3[m]).toBeTruthy();
        expect(EXPLICACION_S3[m].length).toBeGreaterThan(30);
      }
    });

    it('la de sin-credenciales aclara que NO es el bucket ni los permisos', () => {
      // Es la parte que evita repetir el diagnostico equivocado.
      expect(EXPLICACION_S3['sin-credenciales']).toMatch(/no es un problema del bucket ni de permisos/i);
    });

    it('la de sin-permisos avisa de que subir y consultar son permisos distintos', () => {
      expect(EXPLICACION_S3['sin-permisos']).toMatch(/PutObject/);
      expect(EXPLICACION_S3['sin-permisos']).toMatch(/ListBucket/);
    });
  });
});
