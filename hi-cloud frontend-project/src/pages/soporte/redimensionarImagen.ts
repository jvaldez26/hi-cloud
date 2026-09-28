const ANCHO_MAX_PX = 2000;

/**
 * Redimensiona en el cliente si el ancho pasa de ~2000px — capturas de
 * pantalla de monitores grandes o fotos de celular pesan mucho sin
 * necesidad. Es una optimización de ancho de banda, NO el control de
 * seguridad: el backend vuelve a validar y re-procesar todo (magic bytes,
 * EXIF, límite real) sin confiar en lo que llegue de aquí.
 *
 * Si el navegador no soporta createImageBitmap/canvas, o el archivo no es
 * una imagen decodificable, se sube tal cual — el backend decide.
 */
export async function redimensionarSiEsGrande(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/')) return archivo;
  if (typeof createImageBitmap !== 'function') return archivo;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return archivo;
  }

  if (bitmap.width <= ANCHO_MAX_PX) {
    bitmap.close?.();
    return archivo;
  }

  const escala = ANCHO_MAX_PX / bitmap.width;
  const canvas = document.createElement('canvas');
  canvas.width  = ANCHO_MAX_PX;
  canvas.height = Math.round(bitmap.height * escala);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return archivo;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const tipoSalida = archivo.type === 'image/png' ? 'image/png' : archivo.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, tipoSalida, 0.85));
  if (!blob) return archivo;

  return new File([blob], archivo.name, { type: tipoSalida, lastModified: Date.now() });
}
