import { useCanDo } from '../../hooks/useCanDo';

interface Props {
  accion: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Renderiza `children` solo si el usuario tiene permiso para `accion`.
 * Si no tiene permiso muestra `fallback` (por defecto null).
 *
 * Uso:
 *   <PermisoBoton accion="facturas:crear">
 *     <Button onClick={nuevaFactura}>+ Nueva Factura</Button>
 *   </PermisoBoton>
 */
export default function PermisoBoton({ accion, children, fallback = null }: Props) {
  const puede = useCanDo(accion);
  return puede ? <>{children}</> : <>{fallback}</>;
}
