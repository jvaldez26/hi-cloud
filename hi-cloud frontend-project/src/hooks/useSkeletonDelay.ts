import { useState, useEffect } from 'react';

/**
 * Retarda la visibilidad del skeleton para evitar parpadeo en cargas rápidas.
 *
 * Devuelve `true` solo cuando `isLoading` lleva más de `delay` ms continuos.
 * Durante ese intervalo el componente padre puede seguir mostrando su spinner
 * nativo (ej: <Table loading={isLoading}>) — la transición es imperceptible.
 *
 * @example
 *   const showSkeleton = useSkeletonDelay(isLoading);
 *   return showSkeleton
 *     ? <SkeletonTabla rows={6} cols={8} />
 *     : <Table loading={isLoading} ... />;
 */
export function useSkeletonDelay(isLoading: boolean, delay = 150): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [isLoading, delay]);

  return show;
}
