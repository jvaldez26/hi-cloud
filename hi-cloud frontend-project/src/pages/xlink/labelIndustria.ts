import { SECTORES_EMPRESARIALES } from '../../constants/sectores';

/**
 * 'servicios_prof' → 'Servicios Profesionales' (catálogo de sectores que ya
 * usa el resto del sistema). El Directorio de HiCloud Xlink mostraba el
 * código interno crudo porque nunca pasaba por este catálogo.
 */
export function labelIndustria(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  const conocido = SECTORES_EMPRESARIALES.find(s => s.value === codigo);
  if (conocido) return conocido.label;
  // Sin entrada en el catálogo: capitalizado y sin guiones bajos, nunca el código crudo.
  return codigo.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
