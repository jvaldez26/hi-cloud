// Fuente de cada casilla — para el visor de origen (clic en el ícono de
// cada fila calculada). Fórmula y enlace son texto/reglas ESTÁTICAS (el
// mismo cálculo que ya hace el backend, transcrito aquí); los conteos y
// montos de la cadena de referencias vienen de la respuesta real de la API
// — nunca se inventa un número aquí.

export interface FuenteCasilla {
  formula: string;
  /** Casillas del MISMO documento (IT-1 o Anexo A) cuyo monto se suma/resta para dar esta — se resuelven con datos reales al vuelo. */
  referencias?: number[];
  /** Referencia a una casilla de OTRO documento o período — solo texto, no se puede enlazar en vivo desde aquí. */
  referenciaExterna?: string;
  /** Módulo al que enlaza "ver listado real", si la casilla viene de documentos auditables directamente. */
  modulo?: 'facturas' | 'compras' | 'notas-credito' | 'notas-debito' | 'gastos';
  filtroExtra?: Record<string, string>;
}

export const FUENTE_IT1: Record<number, FuenteCasilla> = {
  1:  { formula: 'SUM(facturas.subtotal) − SUM(notasCrédito.subtotal) + SUM(notasDébito.subtotal), período completo', modulo: 'facturas' },
  2:  { formula: 'SUM(subtotal) de comprobantes tipoNcf = E46 (Exportación) — bienes y servicios sin distinguir', modulo: 'facturas', filtroExtra: { tipoNcf: 'E46' } },
  4:  { formula: 'SUM(subtotal) de líneas con porcentajeIva = 0%, excluyendo exportaciones (E46)', modulo: 'facturas' },
  9:  { formula: 'Casilla 2 + 3 + 4 + 5 + 6 + 7 + 8', referencias: [2, 3, 4, 5, 6, 7, 8] },
  10: { formula: 'Casilla 1 − Casilla 9', referencias: [1, 9] },
  11: { formula: 'SUM(subtotal) de líneas con porcentajeIva = 18%, excluyendo exportaciones', modulo: 'facturas' },
  12: { formula: 'SUM(subtotal) de líneas con porcentajeIva = 16%, excluyendo exportaciones', modulo: 'facturas' },
  16: { formula: 'ITBIS real del e-CF (o 18% × base) de las líneas de la Casilla 11', referencias: [11] },
  17: { formula: 'ITBIS real del e-CF (o 16% × base) de las líneas de la Casilla 12', referencias: [12] },
  21: { formula: 'Casilla 16 + 17 + 18 + 19 + 20', referencias: [16, 17, 18, 19, 20] },
  22: { formula: 'SUM(compras.itbis) + SUM(gastos.itbis) con comprobante fiscal completo (NCF + RNC + tipo de bien + forma de pago)', modulo: 'compras' },
  25: { formula: 'Casilla 22 + 23 + 24', referencias: [22, 23, 24] },
  26: { formula: 'Casilla 21 − Casilla 25, si el resultado es positivo', referencias: [21, 25] },
  27: { formula: 'Casilla 25 − Casilla 21, si el resultado es positivo', referencias: [21, 25] },
  29: { formula: 'Casilla 34 (Nuevo Saldo a Favor) de la declaración del MES ANTERIOR de la misma empresa', referenciaExterna: 'Declaración del período anterior' },
  33: { formula: 'Casilla 26 − 28 − 29 − 30 − 31 − 32, si el resultado es positivo', referencias: [26, 28, 29, 30, 31, 32] },
  34: { formula: 'Casilla 27 + 28 + 29 + 30 + 31 + 32, cuando la Casilla 33 da 0', referencias: [27, 28, 29, 30, 31, 32] },
  35: { formula: 'Recargo por mora calculado por el motor de Herramientas Fiscales sobre la Casilla 33, según la fecha límite del período', referencias: [33] },
  36: { formula: 'Interés indemnizatorio calculado por el motor de Herramientas Fiscales sobre la Casilla 33', referencias: [33] },
  38: { formula: 'Casilla 33 + 35 + 36 + 37', referencias: [33, 35, 36, 37] },
};

export const FUENTE_ANEXO_A: Record<number, FuenteCasilla> = {
  1:  { formula: 'SUM(subtotal) de comprobantes tipoNcf = E31 (Crédito Fiscal)', modulo: 'facturas', filtroExtra: { tipoNcf: 'E31' } },
  2:  { formula: 'SUM(subtotal) de comprobantes tipoNcf = E32 (Consumo)', modulo: 'facturas', filtroExtra: { tipoNcf: 'E32' } },
  3:  { formula: 'SUM(subtotal) de notas de débito (E33) del período', modulo: 'notas-debito' },
  4:  { formula: 'SUM(subtotal) de notas de crédito (E34) del período', modulo: 'notas-credito' },
  6:  { formula: 'SUM(subtotal) de comprobantes tipoNcf = E44 (Régimen Especial)', modulo: 'facturas', filtroExtra: { tipoNcf: 'E44' } },
  7:  { formula: 'SUM(subtotal) de comprobantes tipoNcf = E45 (Gubernamental)', modulo: 'facturas', filtroExtra: { tipoNcf: 'E45' } },
  8:  { formula: 'SUM(subtotal) de comprobantes tipoNcf = E46 (Exportación)', modulo: 'facturas', filtroExtra: { tipoNcf: 'E46' } },
  9:  { formula: 'Comprobantes con tipoNcf sin casilla propia — catch-all, monto neto positivo', modulo: 'facturas' },
  10: { formula: 'Comprobantes con tipoNcf sin casilla propia — catch-all, monto neto negativo', modulo: 'facturas' },
  11: { formula: 'Casilla 1 + 2 + 3 − 4 + 5 + 6 + 7 + 8 + 9 − 10', referencias: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  12: { formula: 'SUM(factura.total) de las líneas de formasPago con tipo = Efectivo (código 01 DGII)', modulo: 'facturas' },
  13: { formula: 'SUM(factura.total) de las líneas de formasPago con tipo = Cheque/Transferencia (código 02 DGII)', modulo: 'facturas' },
  14: { formula: 'SUM(factura.total) de las líneas de formasPago con tipo = Tarjeta (código 03 DGII)', modulo: 'facturas' },
  15: { formula: 'SUM(factura.total) de las líneas de formasPago con tipo = Crédito (código 04 DGII) + el 100% de las notas de débito (sin forma de pago propia)', modulo: 'facturas' },
  17: { formula: 'SUM(factura.total) de las líneas de formasPago con tipo = Permuta (código 05 DGII)', modulo: 'facturas' },
  18: { formula: 'SUM(factura.total) de facturas sin formasPago capturado + código 06 DGII (el sistema no distingue bonos de "otras")' },
  19: { formula: 'Casilla 12 + 13 + 14 + 15 + 16 + 17 + 18', referencias: [12, 13, 14, 15, 16, 17, 18] },
  20: { formula: '= Casilla 1 del IT-1 (Total de Operaciones del Período) — el sistema no distingue tipos de ingreso', referenciaExterna: 'Casilla 1 del IT-1' },
  26: { formula: 'Casilla 20 + 21 + 22 + 23 + 24 + 25', referencias: [20, 21, 22, 23, 24, 25] },
  48: { formula: 'Casilla 45 + 46 + 47', referencias: [45, 46, 47] },
  50: { formula: '= Casilla 22 del IT-1 (ITBIS Pagado en Compras Locales), solo cuando el período NO tiene venta local exenta', referenciaExterna: 'Casilla 22 del IT-1' },
  52: { formula: 'Casilla 49 + 50 + 51', referencias: [49, 50, 51] },
  53: { formula: '= Casilla 22 del IT-1, tratado como "común" en su totalidad cuando el período SÍ tiene venta local exenta (no se puede atribuir compra por compra)', referenciaExterna: 'Casilla 22 del IT-1' },
  54: { formula: '((Casilla 2 + 5 + 10 del IT-1) / Casilla 1 del IT-1) × 100 — motor de Proporcionalidad ITBIS de Herramientas Fiscales', referenciaExterna: 'Casillas 1, 2, 5 y 10 del IT-1' },
  55: { formula: 'Casilla 53 × Casilla 54 ÷ 100', referencias: [53, 54] },
  56: { formula: 'Casilla 52 + Casilla 55', referencias: [52, 55] },
};
