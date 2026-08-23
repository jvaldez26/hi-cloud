import { S3Service } from './s3.service';

/**
 * El S3Client de contenido (media) SIEMPRE usa perfil explícito.
 *
 * Este test existe para que nadie pueda refactorizar S3Service y dejar
 * new S3Client({ region }) sin credentials — exactamente el bug que en
 * BackupService causó el CredentialsProviderError del 2026-08-21.
 *
 * La regla: dos buckets con requisitos de seguridad distintos (media vs
 * backups) necesitan dos clientes con dos perfiles separados. Si el perfil
 * no es explícito, el SDK toma AWS_PROFILE del proceso — una variable global
 * que el siguiente deploy puede pisar sin que nadie lo note.
 */

const configFalso = { get: (_k: string, def?: any) => def ?? '' } as any;

const configConS3 = {
  get: (k: string, def?: any) => {
    if (k === 'AWS_S3_BUCKET')   return 'test-media-bucket';
    if (k === 'AWS_REGION')      return 'us-east-2';
    if (k === 'AWS_S3_PROFILE')  return 'mi-perfil-media';
    return def ?? '';
  },
} as any;

describe('S3Service — perfil explícito obligatorio', () => {
  it('lee el perfil de AWS_S3_PROFILE, nunca del AWS_PROFILE global', () => {
    const svc = new S3Service(configConS3);
    // Si alguien cambia fromIni() por new S3Client({ region }),
    // credentialProfile quedará en '' y este test falla.
    expect(svc.credentialProfile).toBe('mi-perfil-media');
  });

  it('el default de perfil es hicloud-media, no la cadena vacía', () => {
    // configFalso devuelve '' para AWS_S3_PROFILE — pero el servicio tiene
    // un default hardcodeado ('hicloud-media') para el caso en que la variable
    // no esté configurada.
    const svc = new S3Service(configFalso);
    expect(svc.credentialProfile).toBe('hicloud-media');
  });

  it('con bucket vacío isEnabled es false, pero el cliente se construye igualmente con perfil', () => {
    // El cliente debe existir aunque no haya bucket: la migración de base64
    // puede llegar con un bucketOverride, y en ese caso necesita credenciales.
    const svc = new S3Service(configFalso);
    expect(svc.isEnabled).toBe(false);
    // El perfil está presente aunque el bucket esté vacío.
    expect(svc.credentialProfile).not.toBe('');
  });
});

/**
 * EL TEST QUE BLINDA EL ARRANQUE EN PRODUCCIÓN
 *
 * Escenario exacto del deploy cuando el bucket de media aún no existe:
 *   - AWS_S3_BUCKET vacío (isEnabled = false)
 *   - AWS_S3_PROFILE apunta a un perfil que NO existe en ~/.aws/credentials
 *   - AWS_SHARED_CREDENTIALS_FILE apunta a un archivo que NO existe
 *
 * fromIni() en AWS SDK v3 es lazy: devuelve una función (() => Promise<Credentials>)
 * que solo se invoca cuando el SDK va a firmar una petición HTTP real.
 * Con bucket vacío, upload() devuelve null antes de llamar a client.send(),
 * así que la función nunca se invoca y el perfil inexistente nunca se resuelve.
 *
 * Si alguien cambia el código para que fromIni() se invoque en el constructor
 * (p.ej. llamando a client.config.credentials()), este test lo detecta.
 */
describe('S3Service — arranque seguro con perfil inexistente', () => {
  it('bucket vacío + perfil que no existe en ningún archivo → arranca sin lanzar', () => {
    const configPerfilInexistente = {
      get: (k: string, def?: any) => {
        if (k === 'AWS_S3_PROFILE')              return 'perfil-que-no-existe';
        if (k === 'AWS_SHARED_CREDENTIALS_FILE') return '/ruta/que/no/existe.ini';
        return def ?? ''; // AWS_S3_BUCKET → '' → isEnabled = false
      },
    } as any;

    // fromIni() es lazy — no resuelve credenciales en el constructor del S3Client.
    // Si esto lanza, el incidente del 2026-08-21 se repite con hicloud-media.
    expect(() => new S3Service(configPerfilInexistente)).not.toThrow();

    const svc = new S3Service(configPerfilInexistente);
    expect(svc.isEnabled).toBe(false);
    expect(svc.credentialProfile).toBe('perfil-que-no-existe');
  });
});
