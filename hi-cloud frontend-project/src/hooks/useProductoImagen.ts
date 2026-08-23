import { useQuery } from '@tanstack/react-query';
import { productosApi } from '../api/productos.api';

/**
 * Resuelve la URL de visualización para la imagen de un producto.
 *
 * - Si imagenUrl es base64 (data:...) → devuelve directo, sin llamada al servidor.
 * - Si imagenUrl es una key S3 (e.g. "imagenes/productos/2/abc.jpg")
 *   o una URL absoluta → pide URL firmada al backend (válida 5 min).
 * - Si imagenUrl está vacío → devuelve src = undefined.
 *
 * La URL firmada se mantiene en caché 4 minutos (1 minuto antes de que expire
 * la firma de S3, que dura 5 minutos), así nunca se sirve una URL vencida.
 *
 * Uso:
 *   const { src, isLoading } = useProductoImagen(producto.id, producto.imagenUrl);
 *   <img src={src} />
 */
export function useProductoImagen(
  productoId: number | undefined,
  imagenUrl:  string | null | undefined,
): { src: string | undefined; isLoading: boolean } {
  const isBase64    = typeof imagenUrl === 'string' && imagenUrl.startsWith('data:');
  const needsFetch  = !isBase64 && !!imagenUrl && !!productoId;

  const query = useQuery({
    queryKey:  ['producto-imagen', productoId],
    queryFn:   () => productosApi.getImagenUrl(productoId!),
    enabled:   needsFetch,
    staleTime: 4 * 60 * 1000,  // 4 min — revalidar antes de que expire la firma (5 min)
    gcTime:    5 * 60 * 1000,  // 5 min — mantener en memoria mientras la firma es válida
    retry:     1,
  });

  if (isBase64)      return { src: imagenUrl as string, isLoading: false };
  if (!imagenUrl)    return { src: undefined,           isLoading: false };
  return { src: query.data?.url, isLoading: query.isLoading };
}
