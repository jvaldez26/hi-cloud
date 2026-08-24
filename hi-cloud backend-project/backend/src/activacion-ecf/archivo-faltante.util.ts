import { BadRequestException } from '@nestjs/common';

/**
 * Explica POR QUÉ no llegó un archivo, en vez de decir "falta el archivo".
 *
 * ── DE DÓNDE SALE ESTO ──────────────────────────────────────────────────────
 *
 * El guard original era `if (!archivo?.buffer) throw 'Falta el archivo'`. Ese
 * mensaje cubre dos situaciones que no se parecen en nada:
 *
 *   a) el usuario no seleccionó nada — "falta el archivo" es correcto;
 *   b) el usuario SÍ lo seleccionó y algo lo perdió por el camino — y entonces
 *      el mensaje es falso y manda a buscar donde no está.
 *
 * Pasó el caso (b): el cliente axios llevaba 'Content-Type: application/json'
 * por defecto y axios convertía el FormData a JSON, descartando el File. El
 * usuario veía el nombre del archivo en pantalla y el servidor le decía que
 * faltaba. Una hora perdida.
 *
 * Un mensaje que miente cuesta más que no tener mensaje.
 */
export function exigirArchivo(
  archivo: { buffer?: Buffer } | undefined,
  contentType: string | undefined,
  campo: string,
): asserts archivo is { buffer: Buffer } {
  if (archivo?.buffer) return;

  const tipo = String(contentType ?? '').toLowerCase();

  // La causa más probable, y la que no se adivina desde el navegador: la
  // petición no era multipart, así que el archivo nunca llegó a existir para
  // el servidor por mucho que estuviera seleccionado en pantalla.
  if (!tipo.includes('multipart/form-data')) {
    throw new BadRequestException(
      `El archivo no llegó al servidor: la petición se envió como ` +
      `"${tipo || 'sin tipo'}" en vez de multipart/form-data. ` +
      `No es que falte el archivo — es que el envío no lo incluyó. ` +
      `Recarga la página e inténtalo de nuevo; si sigue igual, avísanos.`,
    );
  }

  // Multipart correcto pero sin el campo: o no se seleccionó, o el fileFilter
  // lo rechazó por extensión, o superó el límite de tamaño. Los dos últimos
  // tienen su propio mensaje antes de llegar aquí, así que lo que queda es que
  // de verdad no venga.
  throw new BadRequestException(
    `No se recibió ningún archivo en el campo "${campo}". ` +
    `Selecciona el archivo antes de continuar.`,
  );
}
