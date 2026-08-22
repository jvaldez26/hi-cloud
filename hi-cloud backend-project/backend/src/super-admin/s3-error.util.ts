/**
 * Por que fallo una operacion contra S3.
 *
 * Existe porque `verificarS3()` hacia `catch {}` y el panel solo sabia decir
 * "S3 no responde". Con ese mensaje, tres causas completamente distintas —el
 * bucket no existe, no hay permisos, el backend no tiene credenciales— se ven
 * exactamente igual, y la unica forma de distinguirlas era entrar al servidor.
 *
 * En el caso real que motivo esto, el bucket estaba bien y los respaldos
 * llevaban meses subiendose sin un fallo: lo que faltaba eran credenciales en
 * el backend (AWS_ACCESS_KEY_ID comentada y la instancia sin rol IAM). El
 * `catch` tenia esa respuesta en la mano y la tiraba.
 */
export type MotivoFalloS3 =
  | 'sin-credenciales'
  | 'sin-permisos'
  | 'no-existe'
  | 'region-incorrecta'
  | 'desconocido';

/**
 * Clasifica un error del SDK de AWS.
 *
 * El orden importa: un fallo de credenciales puede llegar con status 403, asi
 * que se mira PRIMERO si el problema es que no hay con que firmar. Confundirlo
 * con "sin permisos" manda a revisar politicas IAM que estan perfectas.
 */
export function clasificarErrorS3(e: any): MotivoFalloS3 {
  const nombre  = String(e?.name ?? e?.Code ?? '');
  const mensaje = String(e?.message ?? '');
  const status  = e?.$metadata?.httpStatusCode;
  const texto   = `${nombre} ${mensaje}`;

  // El SDK v3 lanza CredentialsProviderError cuando la cadena de proveedores
  // se agota sin encontrar nada. La CLI dice "Unable to locate credentials".
  if (/CredentialsProviderError|CredentialsError|Unable to locate credentials|could not load credentials|Resolved credential object is not valid/i.test(texto)) {
    return 'sin-credenciales';
  }
  // Firma invalida o token caducado: hay credenciales, pero no sirven.
  if (/InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken|InvalidToken|AuthFailure/i.test(texto)) {
    return 'sin-credenciales';
  }
  if (status === 301 || /PermanentRedirect|BucketRegionError|does not match the region/i.test(texto)) {
    return 'region-incorrecta';
  }
  if (status === 404 || /^NotFound$|NoSuchBucket/i.test(nombre)) {
    return 'no-existe';
  }
  if (status === 403 || /^Forbidden$|AccessDenied/i.test(nombre)) {
    return 'sin-permisos';
  }
  return 'desconocido';
}

/** Que hacer con cada motivo, en una linea, para mostrarlo en el panel. */
export const EXPLICACION_S3: Record<MotivoFalloS3, string> = {
  'sin-credenciales':
    'El backend no tiene credenciales de AWS. No es un problema del bucket ni de permisos: ' +
    'el proceso no puede firmar la peticion. Revisa AWS_PROFILE / AWS_SHARED_CREDENTIALS_FILE ' +
    'en el .env del servidor, o dale un rol IAM a la instancia.',
  'sin-permisos':
    'Las credenciales del backend son validas pero les falta s3:ListBucket sobre el bucket. ' +
    'Subir (s3:PutObject) y consultar son permisos distintos: el respaldo puede estar subiendo bien.',
  'no-existe':
    'El bucket no existe con ese nombre. Revisa AWS_S3_BACKUP_BUCKET en el .env del servidor.',
  'region-incorrecta':
    'El bucket existe pero esta en otra region. Revisa AWS_REGION en el .env del servidor.',
  'desconocido':
    'S3 no respondio y el error no encaja en ningun caso conocido. Mira el log del backend.',
};
