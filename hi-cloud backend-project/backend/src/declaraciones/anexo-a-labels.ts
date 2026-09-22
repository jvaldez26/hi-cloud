/**
 * Rótulos de cada casilla del Anexo A, transcritos del formulario oficial
 * DGII (IT-1-2020.xls) — usados por el PDF. Duplicado a propósito del mapa
 * homónimo en el frontend (src/pages/declaraciones/casillasLabels.ts):
 * backend y frontend son despliegues separados sin paquete de tipos
 * compartido en este repo, así que no hay forma de importar uno desde el
 * otro sin crear un paquete nuevo solo para esto.
 */
export const LABELS_ANEXO_A: Record<number, string> = {
  1:  'Comprobantes Válido para Crédito Fiscal (01 y 31)',
  2:  'Comprobantes Consumo (02 y 32)',
  3:  'Comprobantes Nota de Débito (03 y 33)',
  4:  'Comprobantes Nota de Crédito (04 y 34)',
  5:  'Comprobantes Registro Único de Ingresos (12)',
  6:  'Comprobantes Régimen Especial (14 y 44)',
  7:  'Comprobantes Gubernamentales (15 y 45)',
  8:  'Comprobantes para Exportaciones (16 y 46)',
  9:  'Otras Operaciones (Positivas)',
  10: 'Otras Operaciones (Negativas)',
  11: 'Total Operaciones',
  12: 'Efectivo',
  13: 'Cheque / Transferencia',
  14: 'Tarjeta Débito / Crédito',
  15: 'A Crédito',
  16: 'Bonos o Certificado de Regalo',
  17: 'Permutas',
  18: 'Otras Formas de Venta',
  19: 'Total Operaciones por Tipo de Venta',
  20: 'Ingresos por Operaciones (No Financieros)',
  21: 'Ingresos Financieros',
  22: 'Ingresos Extraordinarios',
  23: 'Ingresos por Arrendamientos',
  24: 'Ingresos por Venta de Activos Depreciables',
  25: 'Otros Ingresos',
  26: 'Total por Tipo de Ingreso',
  45: 'No Deducible — Productores de Bienes/Servicios Exentos',
  46: 'No Deducible — Activos Categoría I',
  47: 'Otros ITBIS Pagados No Deducibles',
  48: 'Total ITBIS No Deducible',
  49: 'Deducible — Bienes Exportados',
  50: 'Deducible — Bienes Gravados',
  51: 'Deducible — Servicios Gravados',
  52: 'Total ITBIS Deducible No Sujeto a Proporcionalidad',
  53: 'ITBIS Sujeto a Proporcionalidad',
  54: 'Coeficiente de Proporcionalidad (%)',
  55: 'ITBIS Admitido por Aplicación de Proporcionalidad',
  56: 'Total ITBIS Deducible',
};
