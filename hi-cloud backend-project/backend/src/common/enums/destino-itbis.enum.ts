/**
 * Destino del ITBIS pagado en una línea de compra o en un gasto — alimenta
 * las casillas 45-51 del Anexo A del IT-1 (anexo-a.service.ts) en vez de
 * mostrarlas siempre "no aplica". GRAVADO es el default implícito: NULL en
 * BD se trata exactamente igual (compras.service.ts / gastos.service.ts).
 */
export enum DestinoItbis {
  GRAVADO             = 'gravado',
  EXPORTACION         = 'exportacion',
  EXENTO              = 'exento',
  ACTIVO_CATEGORIA_I  = 'activo_categoria_i',
  OTRO                = 'otro',
}

export const DESTINO_ITBIS_LABELS: Record<DestinoItbis, string> = {
  [DestinoItbis.GRAVADO]:            'Bienes/servicios gravados',
  [DestinoItbis.EXPORTACION]:        'Exportación',
  [DestinoItbis.EXENTO]:             'No deducible — producción de bienes/servicios exentos',
  [DestinoItbis.ACTIVO_CATEGORIA_I]: 'No deducible — a incluir en Activos (Categoría I)',
  [DestinoItbis.OTRO]:               'No deducible — otro motivo',
};
