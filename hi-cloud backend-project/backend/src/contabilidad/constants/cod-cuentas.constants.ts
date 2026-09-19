/**
 * Códigos de cuenta por defecto del motor de asientos (2026-09-19) — movidos
 * aquí desde asientos-automaticos.service.ts para que
 * ConfiguracionContableService pueda importarlos como default de cada
 * concepto configurable sin crear una dependencia circular entre los dos
 * servicios (AsientosAutomaticosService también los sigue usando — ver el
 * re-export en ese archivo). Sigue siendo la única fuente de verdad de "qué
 * usa el motor si la empresa no configuró nada".
 */
export const COD = {
  CLIENTES:                '1.1.2.01',
  BANCOS:                  '1.1.1.03',
  CAJA:                    '1.1.1.02',
  INVENTARIO:              '1.1.3.01',
  ITBIS_CREDITO:           '1.1.4.01',
  PROVEEDORES:             '2.1.1.01',
  ITBIS_POR_PAGAR:         '2.1.2.01',
  VENTAS:                  '4.1.1.01',
  SUELDOS:                 '6.1.1.01',
  TSS_PATRONAL:            '6.1.1.02',
  SUELDOS_X_PAGAR:         '2.1.3.01',
  TSS_X_PAGAR:             '2.1.3.02',
  ISR_X_PAGAR:             '2.1.2.02',
  ITBIS_CREDITO_COMPRAS:   '1.1.4.01',
  ANTICIPOS_CLIENTES:      '2.1.5.01',  // Pasivo corriente — anticipos recibidos
  GANANCIA_CAMBIARIA:      '4.1.3.01',  // Ingreso — ganancia en diferencia cambiaria
  PERDIDA_CAMBIARIA:       '6.1.5.01',  // Gasto — pérdida en diferencia cambiaria
  ITBIS_RET_POR_PAGAR:     '2.1.2.03',  // Pasivo — ITBIS retenido por enterar a DGII (E41)
  ISR_RET_POR_PAGAR:       '2.1.2.04',  // Pasivo — ISR retenido por enterar a DGII (E41)
  GASTOS_IMPORT_X_APLICAR: '2.1.6.01',  // Transitoria — gastos de importación hasta llegar la factura del agente
  COSTO_VENTAS:            '5.1.1.01',  // Costo — Costo de Ventas de Bienes (AVCO, snapshot en factura_detalles.costoUnitario)
} as const;
